import { eq } from "drizzle-orm";
import { db } from "@/db";
import { trades } from "@/db/schema";
import { parseTradeInput } from "@/lib/trade-validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Trade not found." }, { status: 404 });
    const values = parseTradeInput(await request.json());
    const [trade] = await db.update(trades).set({ ...values, isDemo: false }).where(eq(trades.id, id)).returning();
    if (!trade) return Response.json({ error: "Trade not found." }, { status: 404 });
    return Response.json(trade);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Couldn't update this trade." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Trade not found." }, { status: 404 });
    const [deleted] = await db.delete(trades).where(eq(trades.id, id)).returning({ id: trades.id });
    if (!deleted) return Response.json({ error: "Trade not found." }, { status: 404 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Couldn't delete this trade." }, { status: 500 });
  }
}
