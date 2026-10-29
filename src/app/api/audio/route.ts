import { and, asc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { ALLOWED_AUDIO_MIMES, audioErrorMessage, cleanTrackTitle } from "@/lib/audio";
import { PayloadTooLargeError, readLimitedBody } from "@/lib/request-body";
import { AUDIO_CHUNK_BYTES, MAX_AUDIO_TOTAL_BYTES, MAX_AUDIO_TRACKS, type AudioMimeType, type AudioTrackMeta } from "@/lib/types";

const createAudioSchema = z.object({
  title: z.string().max(80).optional(),
  fileName: z.string().min(1).max(180),
  mimeType: z.enum(ALLOWED_AUDIO_MIMES as [AudioMimeType, ...AudioMimeType[]]),
  size: z.number().int().positive().max(MAX_AUDIO_TOTAL_BYTES),
  durationSec: z.number().finite().positive().max(86400).nullable().optional(),
});

function toMeta(row: {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  size: number;
  durationSec: number | null;
  sortOrder: number;
  createdAt: Date;
}): AudioTrackMeta {
  return {
    id: row.id,
    title: row.title,
    fileName: row.fileName,
    mimeType: row.mimeType as AudioMimeType,
    size: row.size,
    durationSec: row.durationSec,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return Response.json({ error: "Private account storage is not configured." }, { status: 503 });
  const { auth } = await import("@/lib/auth");
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Please sign in again." }, { status: 401 });

  const { db } = await import("@/db");
  const { audioTracks } = await import("@/db/schema");
  const rows = await db
    .select()
    .from(audioTracks)
    .where(and(eq(audioTracks.userId, session.user.id), eq(audioTracks.status, "ready")))
    .orderBy(asc(audioTracks.sortOrder), asc(audioTracks.createdAt));

  const tracks = rows.map(toMeta);
  const totalBytes = tracks.reduce((sum, item) => sum + item.size, 0);
  return Response.json(
    { tracks, totalBytes, maxTracks: MAX_AUDIO_TRACKS, maxBytes: MAX_AUDIO_TOTAL_BYTES },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return Response.json({ error: "Private account storage is not configured." }, { status: 503 });
  const { auth, isAllowedMutation } = await import("@/lib/auth");
  if (!isAllowedMutation(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Please sign in again." }, { status: 401 });

  try {
    const raw = await readLimitedBody(request, 16_384);
    const parsed = createAudioSchema.safeParse(JSON.parse(new TextDecoder().decode(raw)));
    if (!parsed.success) return Response.json({ error: audioErrorMessage("format") }, { status: 400 });

    const { fileName, mimeType, size, durationSec } = parsed.data;
    const title = (parsed.data.title?.trim() || cleanTrackTitle(fileName)).slice(0, 80);
    const expectedChunks = Math.ceil(size / AUDIO_CHUNK_BYTES);
    const id = crypto.randomUUID();

    const { db } = await import("@/db");
    const { audioTracks } = await import("@/db/schema");

    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`audio:${session.user.id}`}))`);
      // Clean up abandoned uploads older than 30 minutes so interrupted sessions don't block quota.
      const staleCutoff = new Date(Date.now() - 30 * 60 * 1000);
      await tx
        .delete(audioTracks)
        .where(and(eq(audioTracks.userId, session.user.id), eq(audioTracks.status, "uploading"), lt(audioTracks.createdAt, staleCutoff)));

      const existing = await tx
        .select({ size: audioTracks.size, status: audioTracks.status, sortOrder: audioTracks.sortOrder })
        .from(audioTracks)
        .where(eq(audioTracks.userId, session.user.id));

      if (existing.length >= MAX_AUDIO_TRACKS) throw new Error(audioErrorMessage("max_tracks"));
      const usedBytes = existing.reduce((sum, row) => sum + Number(row.size), 0);
      if (usedBytes + size > MAX_AUDIO_TOTAL_BYTES) throw new Error(audioErrorMessage("quota"));
      const nextOrder = existing.length ? Math.max(...existing.map((row) => row.sortOrder)) + 1 : 0;

      await tx.insert(audioTracks).values({
        id,
        userId: session.user.id,
        title,
        fileName,
        mimeType,
        size,
        durationSec: durationSec ?? null,
        sortOrder: nextOrder,
        chunkSize: AUDIO_CHUNK_BYTES,
        expectedChunks,
        status: "uploading",
      });
    });

    return Response.json(
      { id, chunkSize: AUDIO_CHUNK_BYTES, expectedChunks },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return Response.json({ error: "Request body is too large." }, { status: 413 });
    const message = error instanceof Error ? error.message : "";
    const known = [audioErrorMessage("max_tracks"), audioErrorMessage("quota"), audioErrorMessage("format")].includes(message);
    return Response.json({ error: known ? message : "Couldn't start song upload." }, { status: known ? 400 : 500 });
  }
}
