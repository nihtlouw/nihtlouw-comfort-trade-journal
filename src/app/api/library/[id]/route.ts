import { and, eq } from "drizzle-orm";
import { journalImages } from "@/db/schema";
import { deleteCloudObject, getCloudObject, getObjectStorageConfig } from "@/lib/object-storage";

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

  let payload: Uint8Array;
  if (doc.storageKey) {
    const objectConfig = getObjectStorageConfig();
    if (!objectConfig) return Response.json({ error: "Cloud object storage is not configured." }, { status: 503 });
    payload = await getCloudObject({ config: objectConfig, key: doc.storageKey });
  } else {
    payload = new Uint8Array(Buffer.from(doc.data, "base64"));
  }

  const safeName = doc.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(new Blob([new Uint8Array(payload)]), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Content-Length": String(payload.byteLength),
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
    .returning({ id: journalImages.id, storageKey: journalImages.storageKey });
  if (!deleted) return Response.json({ error: "Not found." }, { status: 404 });

  if (deleted.storageKey) {
    const objectConfig = getObjectStorageConfig();
    if (objectConfig) {
      await deleteCloudObject({ config: objectConfig, key: deleted.storageKey }).catch(() => {});
    }
  }
  return Response.json({ ok: true });
}
