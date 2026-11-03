import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type BillingProvider = "midtrans" | "lemonsqueezy" | "manual";
export type BillingCycle = "monthly" | "yearly";
export type BillingCurrency = "IDR" | "USD";
export type SubscriptionPlan = "free" | "pro";
export type SubscriptionStatus = "inactive" | "active" | "past_due" | "cancelled" | "expired";

export type CloudSubscriptionInfo = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  isPro: boolean;
  provider: BillingProvider | null;
  currency: BillingCurrency | null;
  billingCycle: BillingCycle | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export type CloudContext = {
  available: boolean;
  saasMode: boolean;
  signedIn: boolean;
  googleEnabled: boolean;
  midtransEnabled: boolean;
  lemonSqueezyEnabled: boolean;
  pricing: {
    idrMonthly: number;
    idrYearly: number;
    usdMonthly: number;
    usdYearly: number;
  };
  user: { id: string; name: string; email: string } | null;
  subscription: CloudSubscriptionInfo | null;
};

export function getSaasPricing(env: NodeJS.ProcessEnv = process.env) {
  const num = (val: string | undefined, fallback: number) => {
    const parsed = Number(val);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    idrMonthly: num(env.BLOOM_PRO_IDR_MONTHLY || env.MIDTRANS_PRICE_IDR_MONTHLY, 49_000),
    idrYearly: num(env.BLOOM_PRO_IDR_YEARLY || env.MIDTRANS_PRICE_IDR_YEARLY, 469_000),
    usdMonthly: num(env.BLOOM_PRO_USD_MONTHLY || env.LEMONSQUEEZY_PRICE_USD_MONTHLY, 6),
    usdYearly: num(env.BLOOM_PRO_USD_YEARLY || env.LEMONSQUEEZY_PRICE_USD_YEARLY, 58),
  };
}

export function isMidtransConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.MIDTRANS_SERVER_KEY?.trim());
}

export function isLemonSqueezyConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.LEMONSQUEEZY_API_KEY?.trim() &&
      env.LEMONSQUEEZY_STORE_ID?.trim() &&
      (env.LEMONSQUEEZY_VARIANT_MONTHLY_ID?.trim() || env.LEMONSQUEEZY_VARIANT_YEARLY_ID?.trim()),
  );
}

export function isGoogleAuthConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());
}

export function isSaasBillingConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.BLOOM_SAAS_MODE === "true" ||
    isMidtransConfigured(env) ||
    isLemonSqueezyConfigured(env)
  );
}

export function isProEntitled(
  sub: {
    plan: string;
    status: string;
    currentPeriodEnd?: Date | string | null;
  } | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!sub || sub.plan !== "pro") return false;
  if (sub.status !== "active" && sub.status !== "cancelled") return false;
  if (sub.currentPeriodEnd) {
    const end = sub.currentPeriodEnd instanceof Date ? sub.currentPeriodEnd : new Date(sub.currentPeriodEnd);
    if (!Number.isNaN(end.getTime()) && end.getTime() <= now.getTime()) {
      return false;
    }
  }
  return true;
}

export function computeNextPeriodEnd(cycle: BillingCycle, from: Date = new Date()): Date {
  const next = new Date(from.getTime());
  if (cycle === "yearly") {
    next.setUTCDate(next.getUTCDate() + 366);
  } else {
    next.setUTCDate(next.getUTCDate() + 31);
  }
  return next;
}

function safeHexEqual(expectedHex: string, receivedHex: string): boolean {
  const cleanExpected = expectedHex.trim().toLowerCase();
  const cleanReceived = receivedHex.trim().toLowerCase();
  if (!cleanExpected || cleanExpected.length !== cleanReceived.length) return false;
  if (!/^[0-9a-f]+$/.test(cleanExpected) || !/^[0-9a-f]+$/.test(cleanReceived)) return false;
  return timingSafeEqual(Buffer.from(cleanExpected, "hex"), Buffer.from(cleanReceived, "hex"));
}

export function computeMidtransSignature(params: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  serverKey: string;
}): string {
  const raw = `${params.orderId}${params.statusCode}${params.grossAmount}${params.serverKey}`;
  return createHash("sha512").update(raw, "utf8").digest("hex");
}

export function verifyMidtransSignature(params: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  signatureKey: string;
  serverKey: string;
}): boolean {
  if (!params.serverKey.trim()) return false;
  const expected = computeMidtransSignature(params);
  return safeHexEqual(expected, params.signatureKey);
}

export type MidtransWebhookAction =
  | { kind: "activate"; userId: string; orderId: string; cycle: BillingCycle; eventKey: string }
  | { kind: "ignore"; reason: string; eventKey: string };

export function interpretMidtransWebhook(payload: Record<string, unknown>): MidtransWebhookAction {
  const orderId = String(payload.order_id ?? "").trim();
  const txStatus = String(payload.transaction_status ?? "").trim().toLowerCase();
  const fraudStatus = String(payload.fraud_status ?? "accept").trim().toLowerCase();
  const userId = String(payload.custom_field1 ?? "").trim();
  const rawCycle = String(payload.custom_field2 ?? "").trim();
  const cycle: BillingCycle =
    rawCycle === "yearly" || orderId.startsWith("BLM-Y-") ? "yearly" : "monthly";
  const eventKey = `midtrans:${orderId}:${txStatus}:${fraudStatus}`;

  if (!orderId || !userId) {
    return { kind: "ignore", reason: "missing_order_or_user", eventKey };
  }

  const paid =
    txStatus === "settlement" ||
    (txStatus === "capture" && (fraudStatus === "accept" || !fraudStatus));

  if (paid) {
    return { kind: "activate", userId, orderId, cycle, eventKey };
  }

  return { kind: "ignore", reason: `status_${txStatus}`, eventKey };
}

export function computeLemonSqueezySignature(rawBody: string, webhookSecret: string): string {
  return createHmac("sha256", webhookSecret).update(rawBody, "utf8").digest("hex");
}

export function verifyLemonSqueezySignature(params: {
  rawBody: string;
  signatureHex: string;
  webhookSecret: string;
}): boolean {
  if (!params.webhookSecret.trim()) return false;
  const expected = computeLemonSqueezySignature(params.rawBody, params.webhookSecret);
  return safeHexEqual(expected, params.signatureHex);
}

export type LemonSqueezyWebhookAction =
  | {
      kind: "upsert";
      userId: string;
      eventKey: string;
      plan: SubscriptionPlan;
      status: SubscriptionStatus;
      cycle: BillingCycle;
      externalCustomerId: string | null;
      externalSubscriptionId: string | null;
      currentPeriodEnd: Date | null;
      cancelAtPeriodEnd: boolean;
    }
  | { kind: "ignore"; reason: string; eventKey: string };

export function interpretLemonSqueezyWebhook(payload: Record<string, unknown>): LemonSqueezyWebhookAction {
  const meta = (payload.meta ?? {}) as Record<string, unknown>;
  const custom = (meta.custom_data ?? {}) as Record<string, unknown>;
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const attrs = (data.attributes ?? {}) as Record<string, unknown>;

  const eventName = String(meta.event_name ?? "").trim();
  const userId = String(custom.user_id ?? "").trim();
  const rawCycle = String(custom.billing_cycle ?? "").trim();
  const variantName = String(attrs.variant_name ?? "").toLowerCase();
  const cycle: BillingCycle =
    rawCycle === "yearly" || variantName.includes("year") || variantName.includes("annual")
      ? "yearly"
      : "monthly";

  const subId = data.id ? String(data.id) : null;
  const customerId = attrs.customer_id ? String(attrs.customer_id) : null;
  const updatedStamp = String(attrs.updated_at ?? meta.webhook_id ?? "");
  const eventKey = `lemonsqueezy:${eventName}:${subId ?? "none"}:${updatedStamp}`;

  if (!eventName || !userId) {
    return { kind: "ignore", reason: "missing_event_or_user", eventKey };
  }

  // One-time order or subscription lifecycle events
  if (eventName === "order_created") {
    const orderStatus = String(attrs.status ?? "").toLowerCase();
    if (orderStatus === "paid") {
      return {
        kind: "upsert",
        userId,
        eventKey,
        plan: "pro",
        status: "active",
        cycle,
        externalCustomerId: customerId,
        externalSubscriptionId: subId,
        currentPeriodEnd: computeNextPeriodEnd(cycle),
        cancelAtPeriodEnd: false,
      };
    }
    return { kind: "ignore", reason: `order_${orderStatus}`, eventKey };
  }

  if (eventName.startsWith("subscription_")) {
    const lsStatus = String(attrs.status ?? "").toLowerCase();
    const dateRaw = String(attrs.ends_at || attrs.renews_at || "").trim();
    const parsedEnd = dateRaw ? new Date(dateRaw) : null;
    const currentPeriodEnd =
      parsedEnd && !Number.isNaN(parsedEnd.getTime())
        ? parsedEnd
        : lsStatus === "active" || lsStatus === "on_trial"
          ? computeNextPeriodEnd(cycle)
          : null;

    if (lsStatus === "active" || lsStatus === "on_trial") {
      return {
        kind: "upsert",
        userId,
        eventKey,
        plan: "pro",
        status: "active",
        cycle,
        externalCustomerId: customerId,
        externalSubscriptionId: subId,
        currentPeriodEnd,
        cancelAtPeriodEnd: Boolean(attrs.cancelled),
      };
    }

    if (lsStatus === "cancelled") {
      return {
        kind: "upsert",
        userId,
        eventKey,
        plan: "pro",
        status: "cancelled",
        cycle,
        externalCustomerId: customerId,
        externalSubscriptionId: subId,
        currentPeriodEnd,
        cancelAtPeriodEnd: true,
      };
    }

    if (lsStatus === "past_due" || lsStatus === "unpaid") {
      return {
        kind: "upsert",
        userId,
        eventKey,
        plan: "pro",
        status: "past_due",
        cycle,
        externalCustomerId: customerId,
        externalSubscriptionId: subId,
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
      };
    }

    if (lsStatus === "expired") {
      return {
        kind: "upsert",
        userId,
        eventKey,
        plan: "free",
        status: "expired",
        cycle,
        externalCustomerId: customerId,
        externalSubscriptionId: subId,
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
      };
    }
  }

  return { kind: "ignore", reason: `unhandled_${eventName}`, eventKey };
}

export async function createMidtransSnapCheckout(params: {
  userId: string;
  userName: string;
  userEmail: string;
  cycle: BillingCycle;
  returnOrigin: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ orderId: string; redirectUrl: string; token: string }> {
  const env = params.env ?? process.env;
  const serverKey = (env.MIDTRANS_SERVER_KEY ?? "").trim();
  if (!serverKey) throw new Error("Midtrans payment gateway is not configured yet.");

  const pricing = getSaasPricing(env);
  const grossAmount = params.cycle === "yearly" ? pricing.idrYearly : pricing.idrMonthly;
  const isProd = env.MIDTRANS_IS_PRODUCTION === "true";
  const snapUrl = isProd
    ? "https://app.midtrans.com/snap/v1/transactions"
    : "https://app.sandbox.midtrans.com/snap/v1/transactions";

  const rand = crypto.randomUUID().slice(0, 8);
  const orderId = `BLM-${params.cycle === "yearly" ? "Y" : "M"}-${Date.now().toString(36).toUpperCase()}-${rand.toUpperCase()}`;

  const authHeader = `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`;
  const response = await fetch(snapUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({
      transaction_details: {
        order_id: orderId,
        gross_amount: grossAmount,
      },
      item_details: [
        {
          id: `bloom-pro-${params.cycle}`,
          price: grossAmount,
          quantity: 1,
          name:
            params.cycle === "yearly"
              ? "Bloom Cloud Sync Pro (1 Tahun)"
              : "Bloom Cloud Sync Pro (1 Bulan)",
        },
      ],
      customer_details: {
        first_name: params.userName.slice(0, 40) || "Trader",
        email: params.userEmail,
      },
      custom_field1: params.userId,
      custom_field2: params.cycle,
      callbacks: {
        finish: `${params.returnOrigin}/?billing=success`,
      },
    }),
  });

  const data = (await response.json().catch(() => ({}))) as {
    token?: string;
    redirect_url?: string;
    error_messages?: string[];
  };
  if (!response.ok || !data.redirect_url || !data.token) {
    throw new Error(data.error_messages?.[0] || "Couldn't create Midtrans payment link.");
  }

  return { orderId, redirectUrl: data.redirect_url, token: data.token };
}

export async function createLemonSqueezyCheckout(params: {
  userId: string;
  userName: string;
  userEmail: string;
  cycle: BillingCycle;
  returnOrigin: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ checkoutUrl: string }> {
  const env = params.env ?? process.env;
  const apiKey = (env.LEMONSQUEEZY_API_KEY ?? "").trim();
  const storeId = (env.LEMONSQUEEZY_STORE_ID ?? "").trim();
  const variantId = (
    params.cycle === "yearly"
      ? env.LEMONSQUEEZY_VARIANT_YEARLY_ID || env.LEMONSQUEEZY_VARIANT_MONTHLY_ID
      : env.LEMONSQUEEZY_VARIANT_MONTHLY_ID || env.LEMONSQUEEZY_VARIANT_YEARLY_ID
  )?.trim();

  if (!apiKey || !storeId || !variantId) {
    throw new Error("International checkout (Lemon Squeezy) is not configured yet.");
  }

  const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            email: params.userEmail,
            name: params.userName.slice(0, 60) || "Trader",
            custom: {
              user_id: params.userId,
              billing_cycle: params.cycle,
            },
          },
          product_options: {
            redirect_url: `${params.returnOrigin}/?billing=success`,
          },
        },
        relationships: {
          store: { data: { type: "stores", id: storeId } },
          variant: { data: { type: "variants", id: variantId } },
        },
      },
    }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    data?: { attributes?: { url?: string } };
    errors?: Array<{ detail?: string }>;
  };
  const checkoutUrl = body.data?.attributes?.url;
  if (!response.ok || !checkoutUrl) {
    throw new Error(body.errors?.[0]?.detail || "Couldn't create international checkout session.");
  }
  return { checkoutUrl };
}
