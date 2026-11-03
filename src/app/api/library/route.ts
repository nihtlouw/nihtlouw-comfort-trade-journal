import { and, eq, sql } from "drizzle-orm";
import { deleteCloudObject, getObjectStorageConfig, putCloudObject } from "@/lib/object-storage";
import { PayloadTooLargeError, readLimitedBody } from "@/lib/request-body";
import { hasCloudSyncAccess } from "@/lib/server-billing";
import { validatePdfBlob } from "@/lib/strategy-library";
import { MAX_JOURNAL_PDF_BYTES, MAX_STRATEGY_PDF_BYTES } from "@/lib/types";

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "Private account storage is not configured." }, { status: 503 });
  }
  const { auth, isAllowedMutation } = await import("@/lib/auth");
  if (!isAllowedMutation(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Please sign in again." }, { status: 401 });
  }
  if (!(await hasCloudSyncAccess(session.user.id))) {
    return Response.json({ error: "Active Cloud Sync Pro subscription required." }, { status: 402 });
  }

  let uploadedR2Key: string | null = null;
  const objectConfig = getObjectStorageConfig();

  try {
    const contentType = request.headers.get("content-type");
    if (!contentType?.startsWith("multipart/form-data;")) {
      throw new Error("Choose a valid PDF document (.pdf).");
    }
    const bytes = await readLimitedBody(request, MAX_STRATEGY_PDF_BYTES + 250_000);
    const bounded = new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: new Blob([bytes]),
    });
    const file = (await bounded.formData()).get("file");
    if (!(file instanceof File)) {
      throw new Error("Choose a valid PDF document (.pdf).");
    }
    await validatePdfBlob(file);

    const fileId = crypto.randomUUID();
    const rawName = (file.name.trim() || "strategy.pdf").slice(0, 196);
    const fileName = /\.pdf$/i.test(rawName) ? rawName : `${rawName}.pdf`;
    const rawBytes = new Uint8Array(await file.arrayBuffer());

    const { db } = await import("@/db");
    const { journalImages } = await import("@/db/schema");

    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${session.user.id}))`);
      const [usage] = await tx
        .select({ bytes: sql<number>`coalesce(sum(${journalImages.size}), 0)` })
        .from(journalImages)
        .where(
          and(
            eq(journalImages.userId, session.user.id),
            eq(journalImages.type, "application/pdf"),
          ),
        );
      if (Number(usage.bytes) + file.size > MAX_JOURNAL_PDF_BYTES) {
        throw new Error("Strategy PDF storage quota reached (40 MB).");
      }
      if (objectConfig) {
        const key = `users/${session.user.id}/library/${fileId}`;
        await putCloudObject({ config: objectConfig, key, bytes: rawBytes, contentType: "application/pdf" });
        uploadedR2Key = key;
        await tx.insert(journalImages).values({
          id: fileId,
          userId: session.user.id,
          name: fileName,
          type: "application/pdf",
          size: file.size,
          data: "",
          storageKey: key,
        });
      } else {
        const encoded = Buffer.from(rawBytes).toString("base64");
        await tx.insert(journalImages).values({
          id: fileId,
          userId: session.user.id,
          name: fileName,
          type: "application/pdf",
          size: file.size,
          data: encoded,
        });
      }
    });

    return Response.json(
      { fileId, fileName, size: file.size },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (uploadedR2Key && objectConfig) {
      await deleteCloudObject({ config: objectConfig, key: uploadedR2Key }).catch(() => {});
    }
    if (error instanceof PayloadTooLargeError) {
      return Response.json({ error: "Each strategy PDF must be 10 MB or less." }, { status: 413 });
    }
    const knownMessages = [
      "The selected PDF file is empty.",
      "Each strategy PDF must be 10 MB or less.",
      "Choose a valid PDF document (.pdf).",
      "Strategy PDF storage quota reached (40 MB).",
    ];
    const isKnown = error instanceof Error && knownMessages.includes(error.message);
    return Response.json(
      { error: isKnown ? (error as Error).message : "Couldn't upload strategy PDF." },
      { status: isKnown ? 400 : 500 },
    );
  }
}
