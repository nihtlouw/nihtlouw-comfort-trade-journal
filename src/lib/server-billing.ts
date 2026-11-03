import { eq } from "drizzle-orm";
import { billingEvents, subscriptions, user as userTable } from "@/db/schema";
import {
  computeNextPeriodEnd,
  getSaasPricing,
  interpretLemonSqueezyWebhook,
  interpretMidtransWebhook,
  isGoogleAuthConfigured,
  isLemonSqueezyConfigured,
  isMidtransConfigured,
  isProEntitled,
  isSaasBillingConfigured,
  type BillingCurrency,
  type BillingCycle,
  type BillingProvider,
  type CloudContext,
  type CloudSubscriptionInfo,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from "@/lib/billing";

export const FREE_SUBSCRIPTION: CloudSubscriptionInfo = {
  plan: "free",
  status: "inactive",
  isPro: false,
  provider: null,
  currency: null,
  billingCycle: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

export async function getUserSubscriptionInfo(userId: string): Promise<CloudSubscriptionInfo> {
  if (!process.env.DATABASE_URL) return FREE_SUBSCRIPTION;
  try {
    const { db } = await import("@/db");
    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    if (!row) return FREE_SUBSCRIPTION;
    const isPro = isProEntitled(row);
    return {
      plan: (row.plan === "pro" ? "pro" : "free") as SubscriptionPlan,
      status: (row.status as SubscriptionStatus) || "inactive",
      isPro,
      provider: (row.provider as BillingProvider | null) ?? null,
      currency: (row.currency as BillingCurrency | null) ?? null,
      billingCycle: (row.billingCycle as BillingCycle | null) ?? null,
      currentPeriodEnd: row.currentPeriodEnd ? row.currentPeriodEnd.toISOString() : null,
      cancelAtPeriodEnd: Boolean(row.cancelAtPeriodEnd),
    };
  } catch {
    // Graceful fallback if 0003_bloom_saas_billing.sql has not been applied yet
    return FREE_SUBSCRIPTION;
  }
}

export async function hasCloudSyncAccess(userId: string): Promise<boolean> {
  if (!isSaasBillingConfigured()) return true;
  const sub = await getUserSubscriptionInfo(userId);
  return sub.isPro;
}

export async function buildServerCloudContext(
  sessionUser: { id: string; name: string; email: string } | null,
): Promise<CloudContext> {
  const saasMode = isSaasBillingConfigured();
  const subscription = sessionUser
    ? saasMode
      ? await getUserSubscriptionInfo(sessionUser.id)
      : {
          plan: "pro" as const,
          status: "active" as const,
          isPro: true,
          provider: "manual" as const,
          currency: null,
          billingCycle: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        }
    : null;

  return {
    available: Boolean(process.env.DATABASE_URL),
    saasMode,
    signedIn: Boolean(sessionUser),
    googleEnabled: isGoogleAuthConfigured(),
    midtransEnabled: isMidtransConfigured(),
    lemonSqueezyEnabled: isLemonSqueezyConfigured(),
    pricing: getSaasPricing(),
    user: sessionUser
      ? { id: sessionUser.id, name: sessionUser.name, email: sessionUser.email }
      : null,
    subscription,
  };
}

export async function applyMidtransWebhookPayload(
  payload: Record<string, unknown>,
): Promise<{ processed: boolean; reason?: string }> {
  const action = interpretMidtransWebhook(payload);
  if (action.kind === "ignore") {
    return { processed: false, reason: action.reason };
  }

  const { db } = await import("@/db");
  return db.transaction(async (tx) => {
    const [existingUser] = await tx
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.id, action.userId));
    if (!existingUser) {
      return { processed: false, reason: "unknown_user" };
    }

    const inserted = await tx
      .insert(billingEvents)
      .values({
        eventKey: action.eventKey,
        provider: "midtrans",
        userId: action.userId,
        eventType: String(payload.transaction_status ?? "settlement"),
        payload,
      })
      .onConflictDoNothing()
      .returning({ eventKey: billingEvents.eventKey });

    if (!inserted.length) {
      return { processed: false, reason: "duplicate_event" };
    }

    const [current] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, action.userId));

    const now = new Date();
    const baseDate =
      current?.currentPeriodEnd && current.currentPeriodEnd.getTime() > now.getTime()
        ? current.currentPeriodEnd
        : now;
    const nextEnd = computeNextPeriodEnd(action.cycle, baseDate);

    await tx
      .insert(subscriptions)
      .values({
        userId: action.userId,
        plan: "pro",
        status: "active",
        provider: "midtrans",
        currency: "IDR",
        billingCycle: action.cycle,
        lastOrderId: action.orderId,
        currentPeriodEnd: nextEnd,
        cancelAtPeriodEnd: false,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: subscriptions.userId,
        set: {
          plan: "pro",
          status: "active",
          provider: "midtrans",
          currency: "IDR",
          billingCycle: action.cycle,
          lastOrderId: action.orderId,
          currentPeriodEnd: nextEnd,
          cancelAtPeriodEnd: false,
          updatedAt: now,
        },
      });

    return { processed: true };
  });
}

export async function applyLemonSqueezyWebhookPayload(
  payload: Record<string, unknown>,
): Promise<{ processed: boolean; reason?: string }> {
  const action = interpretLemonSqueezyWebhook(payload);
  if (action.kind === "ignore") {
    return { processed: false, reason: action.reason };
  }

  const { db } = await import("@/db");
  return db.transaction(async (tx) => {
    const [existingUser] = await tx
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.id, action.userId));
    if (!existingUser) {
      return { processed: false, reason: "unknown_user" };
    }

    const meta = (payload.meta ?? {}) as Record<string, unknown>;
    const inserted = await tx
      .insert(billingEvents)
      .values({
        eventKey: action.eventKey,
        provider: "lemonsqueezy",
        userId: action.userId,
        eventType: String(meta.event_name ?? "subscription_updated"),
        payload,
      })
      .onConflictDoNothing()
      .returning({ eventKey: billingEvents.eventKey });

    if (!inserted.length) {
      return { processed: false, reason: "duplicate_event" };
    }

    const now = new Date();
    await tx
      .insert(subscriptions)
      .values({
        userId: action.userId,
        plan: action.plan,
        status: action.status,
        provider: "lemonsqueezy",
        currency: "USD",
        billingCycle: action.cycle,
        externalCustomerId: action.externalCustomerId,
        externalSubscriptionId: action.externalSubscriptionId,
        currentPeriodEnd: action.currentPeriodEnd,
        cancelAtPeriodEnd: action.cancelAtPeriodEnd,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: subscriptions.userId,
        set: {
          plan: action.plan,
          status: action.status,
          provider: "lemonsqueezy",
          currency: "USD",
          billingCycle: action.cycle,
          externalCustomerId: action.externalCustomerId,
          externalSubscriptionId: action.externalSubscriptionId,
          currentPeriodEnd: action.currentPeriodEnd,
          cancelAtPeriodEnd: action.cancelAtPeriodEnd,
          updatedAt: now,
        },
      });

    return { processed: true };
  });
}
