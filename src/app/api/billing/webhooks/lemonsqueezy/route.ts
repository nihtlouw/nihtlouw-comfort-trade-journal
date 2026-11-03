import { verifyLemonSqueezySignature } from "@/lib/billing";
import { PayloadTooLargeError, readLimitedBody } from "@/lib/request-body";
import { applyLemonSqueezyWebhookPayload } from "@/lib/server-billing";

export async function POST(request: Request) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? "";
  if (!process.env.DATABASE_URL || !secret) {
    return Response.json({ error: "Lemon Squeezy webhook is not configured." }, { status: 503 });
  }
  try {
    const rawBody = new TextDecoder().decode(await readLimitedBody(request, 256_000));
    const signatureHex = request.headers.get("x-signature") ?? "";
    if (!verifyLemonSqueezySignature({ rawBody, signatureHex, webhookSecret: secret })) {
      return Response.json({ error: "Invalid Lemon Squeezy signature." }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const result = await applyLemonSqueezyWebhookPayload(payload);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return Response.json({ error: "Webhook payload too large." }, { status: 413 });
    }
    return Response.json({ error: "Invalid Lemon Squeezy webhook payload." }, { status: 400 });
  }
}
