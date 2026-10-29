import { normalizeJournalData } from "@/lib/journal-data";
import { PayloadTooLargeError, readLimitedBody } from "@/lib/request-body";

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) return Response.json({ error: "Private account storage is not configured." }, { status: 503 });
  const { auth } = await import("@/lib/auth");
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Please sign in." }, { status: 401 });
  const { getPrivateJournal } = await import("@/lib/server-journal");
  const result = await getPrivateJournal(session.user.id, session.user.name);
  return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
export async function PUT(request: Request) {
  if (!process.env.DATABASE_URL) return Response.json({ error: "Private account storage is not configured." }, { status: 503 });
  const { auth, isAllowedMutation } = await import("@/lib/auth");
  if (!isAllowedMutation(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Please sign in again." }, { status: 401 });
  let data;
  let revision: number;
  try {
    const text = new TextDecoder().decode(await readLimitedBody(request, 5_000_000));
    const body = JSON.parse(text) as Record<string, unknown>;
    if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0) throw new Error("Invalid journal revision.");
    revision = Number(body.revision); data = normalizeJournalData(body.data);
  } catch (error) {
    return Response.json({ error: error instanceof PayloadTooLargeError ? "Journal data is too large." : "The journal data or revision is invalid." }, { status: error instanceof PayloadTooLargeError ? 413 : 400 });
  }
  try {
    const { updatePrivateJournal } = await import("@/lib/server-journal");
    const result = await updatePrivateJournal(session.user.id, revision, data);
    if (!result) return Response.json({ error: "This journal changed on another device. Reload before saving; your current change has not been saved." }, { status: 409 });
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Couldn't save this journal." }, { status: 500 }); }
}
