import { verifyMidtransSignature } from "@/lib/billing";
import { PayloadTooLargeError, readLimitedBody } from "@/lib/request-body";
import { applyMidtransWebhookPayload } from "@/lib/server-billing";

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL || !process.env.MIDTRANS_SERVER_KEY) {
    return Response.json({ error: "Midtrans webhook is not configured." }, { status: 503 });
  }
  try {
    const rawBody = new TextDecoder().decode(await readLimitedBody(request, 256_000));
    const payload = JSON.parse(rawBody) as Record<string, unknown>;

    const valid = verifyMidtransSignature({
      orderId: String(payload.order_id ?? ""),
      statusCode: String(payload.status_code ?? ""),
      grossAmount: String(payload.gross_amount ?? ""),
      signatureKey: String(payload.signature_key ?? ""),
      serverKey: process.env.MIDTRANS_SERVER_KEY,
    });
    if (!valid) {
      return Response.json({ error: "Invalid Midtrans signature." }, { status: 401 });
    }

    const result = await applyMidtransWebhookPayload(payload);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return Response.json({ error: "Webhook payload too large." }, { status: 413 });
    }
    return Response.json({ error: "Invalid Midtrans webhook payload." }, { status: 400 });
  }
}
