import { buildServerCloudContext } from "@/lib/server-billing";

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json(await buildServerCloudContext(null), {
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  const { auth } = await import("@/lib/auth");
  const session = await auth.api.getSession({ headers: request.headers });
  const ctx = await buildServerCloudContext(
    session?.user
      ? { id: session.user.id, name: session.user.name, email: session.user.email }
      : null,
  );
  return Response.json(ctx, { headers: { "Cache-Control": "private, no-store" } });
}
