import { and, eq } from "drizzle-orm";

function parseByteRange(rangeHeader: string, totalSize: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    const start = Math.max(0, totalSize - suffixLength);
    return { start, end: totalSize - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd ? Math.min(Number(rawEnd), totalSize - 1) : totalSize - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= totalSize || start > end) {
    return null;
  }
  return { start, end };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return Response.json({ error: "Private account storage is not configured." }, { status: 503 });
  const { auth } = await import("@/lib/auth");
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Please sign in again." }, { status: 401 });

  const { id } = await params;
  const { db } = await import("@/db");
  const { audioChunks, audioTracks } = await import("@/db/schema");

  const [track] = await db
    .select()
    .from(audioTracks)
    .where(and(eq(audioTracks.id, id), eq(audioTracks.userId, session.user.id), eq(audioTracks.status, "ready")));

  if (!track) return Response.json({ error: "Song not found." }, { status: 404 });

  const rangeHeader = request.headers.get("range");
  let start = 0;
  let end = track.size - 1;
  let status = 200;

  if (rangeHeader) {
    const parsed = parseByteRange(rangeHeader, track.size);
    if (!parsed) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${track.size}`, "Accept-Ranges": "bytes" },
      });
    }
    start = parsed.start;
    end = parsed.end;
    status = 206;
  }

  const firstChunk = Math.floor(start / track.chunkSize);
  const lastChunk = Math.floor(end / track.chunkSize);
  let nextChunk = firstChunk;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (nextChunk > lastChunk) {
        controller.close();
        return;
      }
      const current = nextChunk++;
      const [row] = await db
        .select({ data: audioChunks.data })
        .from(audioChunks)
        .where(and(eq(audioChunks.trackId, track.id), eq(audioChunks.chunkIndex, current)));

      if (!row) {
        controller.error(new Error("Missing audio chunk."));
        return;
      }

      const chunkGlobalStart = current * track.chunkSize;
      const sliceStart = current === firstChunk ? start - chunkGlobalStart : 0;
      const sliceEnd = current === lastChunk ? end - chunkGlobalStart + 1 : row.data.byteLength;
      const bytes = row.data.subarray(sliceStart, sliceEnd);
      controller.enqueue(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    },
  });

  const headers = new Headers({
    "Content-Type": track.mimeType,
    "Content-Length": String(end - start + 1),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  if (status === 206) {
    headers.set("Content-Range", `bytes ${start}-${end}/${track.size}`);
  }
  return new Response(stream, { status, headers });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) return Response.json({ error: "Private account storage is not configured." }, { status: 503 });
  const { auth, isAllowedMutation } = await import("@/lib/auth");
  if (!isAllowedMutation(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Please sign in again." }, { status: 401 });

  const { id } = await params;
  const { db } = await import("@/db");
  const { audioTracks } = await import("@/db/schema");
  const deleted = await db
    .delete(audioTracks)
    .where(and(eq(audioTracks.id, id), eq(audioTracks.userId, session.user.id)))
    .returning({ id: audioTracks.id });

  if (!deleted.length) return Response.json({ error: "Song not found." }, { status: 404 });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
