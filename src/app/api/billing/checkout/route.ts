import {
  createLemonSqueezyCheckout,
  createMidtransSnapCheckout,
  type BillingCycle,
} from "@/lib/billing";
import { PayloadTooLargeError, readLimitedBody } from "@/lib/request-body";

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "Cloud billing is not configured on this server." }, { status: 503 });
  }
  const { auth, isAllowedMutation } = await import("@/lib/auth");
  if (!isAllowedMutation(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return Response.json({ error: "Please sign in first to subscribe to Cloud Sync Pro." }, { status: 401 });
  }

  try {
    const raw = new TextDecoder().decode(await readLimitedBody(request, 8_192));
    const body = JSON.parse(raw) as { provider?: string; cycle?: string };
    const provider = body.provider === "midtrans" ? "midtrans" : body.provider === "lemonsqueezy" ? "lemonsqueezy" : null;
    const cycle: BillingCycle = body.cycle === "yearly" ? "yearly" : "monthly";
    if (!provider) {
      return Response.json({ error: "Choose a valid payment gateway (midtrans or lemonsqueezy)." }, { status: 400 });
    }

    const returnOrigin = new URL(process.env.BETTER_AUTH_URL || request.url).origin;

    if (provider === "midtrans") {
      const result = await createMidtransSnapCheckout({
        userId: session.user.id,
        userName: session.user.name,
        userEmail: session.user.email,
        cycle,
        returnOrigin,
      });
      return Response.json({ url: result.redirectUrl, orderId: result.orderId });
    }

    const result = await createLemonSqueezyCheckout({
      userId: session.user.id,
      userName: session.user.name,
      userEmail: session.user.email,
      cycle,
      returnOrigin,
    });
    return Response.json({ url: result.checkoutUrl });
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return Response.json({ error: "Request body too large." }, { status: 413 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Couldn't start checkout." },
      { status: 400 },
    );
  }
}
