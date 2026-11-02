import { and, eq } from "drizzle-orm";
import { journalImages } from "@/db/schema";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "Private account storage is not configured." }, { status: 503 });
  }
  const { auth } = await import("@/lib/auth");
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Please sign in." }, { status: 401 });
  }
  const { db } = await import("@/db");
  const { id } = await context.params;
  const [doc] = await db
    .select()
    .from(journalImages)
    .where(
      and(
        eq(journalImages.id, id),
        eq(journalImages.userId, session.user.id),
        eq(journalImages.type, "application/pdf"),
      ),
    );
  if (!doc) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  const safeName = doc.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(new Uint8Array(Buffer.from(doc.data, "base64")), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Content-Length": String(doc.size),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(request: Request, context: Context) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "Private account storage is not configured." }, { status: 503 });
  }
  const { auth, isAllowedMutation } = await import("@/lib/auth");
  if (!isAllowedMutation(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Please sign in." }, { status: 401 });
  }
  const { db } = await import("@/db");
  const { id } = await context.params;
  const [deleted] = await db
    .delete(journalImages)
    .where(
      and(
        eq(journalImages.id, id),
        eq(journalImages.userId, session.user.id),
        eq(journalImages.type, "application/pdf"),
      ),
    )
    .returning({ id: journalImages.id });
  return deleted ? Response.json({ ok: true }) : Response.json({ error: "Not found." }, { status: 404 });
}
