import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { privateJournals } from "@/db/schema";
import { createDemoData } from "@/lib/demo-data";
import { normalizeJournalData } from "@/lib/journal-data";
import type { JournalData } from "@/lib/types";

export async function getPrivateJournal(userId: string, name: string) {
  const demo = createDemoData(); demo.settings.name = name.trim().slice(0, 40) || "friend";
  await db.insert(privateJournals).values({ userId, data: normalizeJournalData(demo) }).onConflictDoNothing();
  const [row] = await db.select().from(privateJournals).where(eq(privateJournals.userId, userId));
  if (!row) throw new Error("Couldn't open this journal.");
  return { data: normalizeJournalData(row.data), revision: row.revision };
}
export async function updatePrivateJournal(userId: string, revision: number, data: JournalData) {
  const [updated] = await db.update(privateJournals).set({ data, revision: revision + 1, updatedAt: new Date() })
    .where(and(eq(privateJournals.userId, userId), eq(privateJournals.revision, revision))).returning({ revision: privateJournals.revision });
  return updated ?? null;
}
