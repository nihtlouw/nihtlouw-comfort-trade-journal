import { validateImage } from "@/lib/attachments";
import { eq, sql } from "drizzle-orm";
import { PayloadTooLargeError, readLimitedBody } from "@/lib/request-body";

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return Response.json({ error: "Private account storage is not configured." }, { status: 503 });
  const { auth, isAllowedMutation } = await import("@/lib/auth");
  if (!isAllowedMutation(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Please sign in again." }, { status: 401 });
  try {
    const contentType = request.headers.get("content-type");
    if (!contentType?.startsWith("multipart/form-data;")) throw new Error("Choose an image.");
    const bytes = await readLimitedBody(request, 2_200_000);
    const bounded = new Request(request.url, { method: "POST", headers: { "Content-Type": contentType }, body: new Blob([bytes]) });
    const file = (await bounded.formData()).get("file");
    if (!(file instanceof File)) throw new Error("Choose an image.");
    const type = await validateImage(file);
    const id = crypto.randomUUID(); const name = file.name.slice(0, 200) || "Screenshot";
    const { db } = await import("@/db"); const { journalImages } = await import("@/db/schema");
    const encoded = Buffer.from(await file.arrayBuffer()).toString("base64");
    await db.transaction(async (tx) => {
      // Serialize quota checks per user; space also covers temporary restore staging.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${session.user.id}))`);
      const [usage] = await tx.select({ bytes: sql<number>`coalesce(sum(${journalImages.size}), 0)` }).from(journalImages).where(eq(journalImages.userId, session.user.id));
      if (Number(usage.bytes) + file.size > 100 * 1024 * 1024) throw new Error("Screenshot storage quota reached.");
      await tx.insert(journalImages).values({ id, userId: session.user.id, name, type, size: file.size, data: encoded });
    });
    return Response.json({ id, name, type, size: file.size }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return Response.json({ error: "Screenshot is too large." }, { status: 413 });
    const known = error instanceof Error && ["Choose an image.", "Choose a PNG, JPEG, WebP, or GIF image.", "Each screenshot must be 2 MB or less.", "The image content does not match its file type.", "Screenshot storage quota reached."].includes(error.message);
    return Response.json({ error: known ? (error as Error).message : "Couldn't upload screenshot." }, { status: known ? 400 : 500 });
  }
}
