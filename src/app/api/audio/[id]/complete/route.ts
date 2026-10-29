import { and, eq, sql } from "drizzle-orm";
import type { AudioMimeType, AudioTrackMeta } from "@/lib/types";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return Response.json({ error: "Private account storage is not configured." }, { status: 503 });
  const { auth, isAllowedMutation } = await import("@/lib/auth");
  if (!isAllowedMutation(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Please sign in again." }, { status: 401 });

  const { id } = await params;
  const { db } = await import("@/db");
  const { audioChunks, audioTracks } = await import("@/db/schema");

  const [track] = await db
    .select()
    .from(audioTracks)
    .where(and(eq(audioTracks.id, id), eq(audioTracks.userId, session.user.id)));

  if (!track) return Response.json({ error: "Song not found." }, { status: 404 });

  if (track.status !== "ready") {
    const [stats] = await db
      .select({
        count: sql<number>`count(*)`,
        bytes: sql<number>`coalesce(sum(${audioChunks.size}), 0)`,
      })
      .from(audioChunks)
      .where(eq(audioChunks.trackId, id));

    if (Number(stats.count) !== track.expectedChunks || Number(stats.bytes) !== track.size) {
      await db.delete(audioTracks).where(and(eq(audioTracks.id, id), eq(audioTracks.userId, session.user.id)));
      return Response.json({ error: "Uploaded song is incomplete. Please try again." }, { status: 400 });
    }

    await db
      .update(audioTracks)
      .set({ status: "ready" })
      .where(and(eq(audioTracks.id, id), eq(audioTracks.userId, session.user.id)));
  }

  const meta: AudioTrackMeta = {
    id: track.id,
    title: track.title,
    fileName: track.fileName,
    mimeType: track.mimeType as AudioMimeType,
    size: track.size,
    durationSec: track.durationSec,
    sortOrder: track.sortOrder,
    createdAt: track.createdAt.toISOString(),
  };

  return Response.json({ track: meta }, { headers: { "Cache-Control": "private, no-store" } });
}
