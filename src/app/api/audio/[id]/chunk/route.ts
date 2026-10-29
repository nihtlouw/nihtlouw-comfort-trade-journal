import { and, eq, sql } from "drizzle-orm";
import { audioErrorMessage, validateAudioHeader } from "@/lib/audio";
import { PayloadTooLargeError, readLimitedBody } from "@/lib/request-body";
import { AUDIO_CHUNK_BYTES, type AudioMimeType } from "@/lib/types";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return Response.json({ error: "Private account storage is not configured." }, { status: 503 });
  const { auth, isAllowedMutation } = await import("@/lib/auth");
  if (!isAllowedMutation(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Please sign in again." }, { status: 401 });

  const { id } = await params;
  const indexParam = new URL(request.url).searchParams.get("index");
  const chunkIndex = indexParam !== null && /^\d+$/.test(indexParam) ? Number(indexParam) : -1;
  if (chunkIndex < 0) return Response.json({ error: "Invalid chunk index." }, { status: 400 });

  try {
    const bytes = await readLimitedBody(request, AUDIO_CHUNK_BYTES + 1024);
    if (!bytes.byteLength || bytes.byteLength > AUDIO_CHUNK_BYTES) {
      return Response.json({ error: "Invalid chunk size." }, { status: 400 });
    }

    const { db } = await import("@/db");
    const { audioChunks, audioTracks } = await import("@/db/schema");
    const [track] = await db
      .select()
      .from(audioTracks)
      .where(and(eq(audioTracks.id, id), eq(audioTracks.userId, session.user.id)));

    if (!track || track.status !== "uploading") {
      return Response.json({ error: "Upload session not found." }, { status: 404 });
    }
    if (chunkIndex >= track.expectedChunks) {
      return Response.json({ error: "Chunk index out of bounds." }, { status: 400 });
    }

    const isLast = chunkIndex === track.expectedChunks - 1;
    const expectedSize = isLast ? track.size - chunkIndex * track.chunkSize : track.chunkSize;
    if (bytes.byteLength !== expectedSize) {
      return Response.json({ error: "Chunk size does not match expected byte length." }, { status: 400 });
    }

    if (chunkIndex === 0 && !validateAudioHeader(bytes.subarray(0, 16), track.mimeType as AudioMimeType)) {
      await db.delete(audioTracks).where(and(eq(audioTracks.id, id), eq(audioTracks.userId, session.user.id)));
      return Response.json({ error: audioErrorMessage("header") }, { status: 400 });
    }

    const data = Buffer.from(bytes);
    await db
      .insert(audioChunks)
      .values({ trackId: id, chunkIndex, size: bytes.byteLength, data })
      .onConflictDoUpdate({
        target: [audioChunks.trackId, audioChunks.chunkIndex],
        set: { size: sql`excluded.size`, data: sql`excluded.data` },
      });

    return Response.json({ ok: true, chunkIndex }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return Response.json({ error: "Chunk is too large." }, { status: 413 });
    return Response.json({ error: "Couldn't store song chunk." }, { status: 500 });
  }
}
