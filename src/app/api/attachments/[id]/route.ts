import { and, eq } from "drizzle-orm";
import { journalImages } from "@/db/schema";
import { deleteCloudObject, getCloudObject, getObjectStorageConfig } from "@/lib/object-storage";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  if (!process.env.DATABASE_URL) return Response.json({ error: "Private account storage is not configured." }, { status: 503 });
  const { auth } = await import("@/lib/auth");
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Please sign in." }, { status: 401 });
  const { db } = await import("@/db");
  const [image] = await db.select().from(journalImages).where(and(eq(journalImages.id, (await context.params).id), eq(journalImages.userId, session.user.id)));
  if (!image) return Response.json({ error: "Not found." }, { status: 404 });

  let payload: Uint8Array;
  if (image.storageKey) {
    const objectConfig = getObjectStorageConfig();
    if (!objectConfig) return Response.json({ error: "Cloud object storage is not configured." }, { status: 503 });
    payload = await getCloudObject({ config: objectConfig, key: image.storageKey });
  } else {
    payload = new Uint8Array(Buffer.from(image.data, "base64"));
  }

  return new Response(new Blob([new Uint8Array(payload)]), {
    headers: {
      "Content-Type": image.type,
      "Content-Length": String(payload.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

export async function DELETE(request: Request, context: Context) {
  if (!process.env.DATABASE_URL) return Response.json({ error: "Private account storage is not configured." }, { status: 503 });
  const { auth, isAllowedMutation } = await import("@/lib/auth");
  if (!isAllowedMutation(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Please sign in." }, { status: 401 });
  const { db } = await import("@/db");
  const [deleted] = await db
    .delete(journalImages)
    .where(and(eq(journalImages.id, (await context.params).id), eq(journalImages.userId, session.user.id)))
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
