async function handler(request: Request) {
  if (!process.env.DATABASE_URL) return Response.json({ error: "Private account storage is not configured." }, { status: 503 });
  const { auth } = await import("@/lib/auth");
  return auth.handler(request);
}
export const GET = handler;
export const POST = handler;
