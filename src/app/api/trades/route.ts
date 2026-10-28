import { eq } from "drizzle-orm";
import { db } from "@/db";
import { trades } from "@/db/schema";
import { ensureJournal } from "@/lib/journal";
import { parseTradeInput } from "@/lib/trade-validation";

export async function POST(request: Request) {
  try {
    await ensureJournal();
    const values = parseTradeInput(await request.json());
    const [trade] = await db.insert(trades).values({ ...values, isDemo: false }).returning();
    return Response.json(trade, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Couldn't save this trade." }, { status: 400 });
  }
}

export async function DELETE() {
  try {
    await ensureJournal();
    await db.delete(trades).where(eq(trades.isDemo, true));
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Couldn't clear sample trades." }, { status: 500 });
  }
}
