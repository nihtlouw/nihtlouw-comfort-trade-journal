import { eq } from "drizzle-orm";
import { db } from "@/db";
import { journalSettings } from "@/db/schema";
import { ensureJournal } from "@/lib/journal";
import { MOODS, type PlaybookRule } from "@/lib/types";

export async function PATCH(request: Request) {
  try {
    await ensureJournal();
    const body = await request.json() as Record<string, unknown>;
    const update: Partial<typeof journalSettings.$inferInsert> = {};
    if ("name" in body) {
      const name = String(body.name ?? "").trim();
      if (!name || name.length > 40) throw new Error("Your name should be between 1 and 40 characters.");
      update.name = name;
    }
    if ("mood" in body) {
      if (body.mood !== null && !MOODS.includes(body.mood as typeof MOODS[number])) throw new Error("Choose a valid feeling.");
      update.mood = body.mood as string | null;
    }
    if ("moodDate" in body) {
      if (body.moodDate !== null && (typeof body.moodDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.moodDate))) throw new Error("Choose a valid date.");
      update.moodDate = body.moodDate as string | null;
    }
    if ("goal" in body) {
      const goal = String(body.goal ?? "").trim();
      if (!goal || goal.length > 100) throw new Error("Your intention should be between 1 and 100 characters.");
      update.goal = goal;
    }
    if ("goalTarget" in body) {
      const target = Number(body.goalTarget);
      if (!Number.isInteger(target) || target < 1 || target > 7) throw new Error("Choose a target between 1 and 7 days.");
      update.goalTarget = target;
    }
    if ("goalProgress" in body) {
      const progress = Number(body.goalProgress);
      if (!Number.isInteger(progress) || progress < 0 || progress > 7) throw new Error("Choose a valid progress amount.");
      update.goalProgress = progress;
    }
    if ("playbook" in body) {
      if (!Array.isArray(body.playbook) || body.playbook.length > 30) throw new Error("Invalid playbook.");
      const rules = body.playbook as PlaybookRule[];
      if (rules.some((rule) => !rule || typeof rule.id !== "string" || typeof rule.text !== "string" || typeof rule.checked !== "boolean" || !["Before trading", "While trading", "After trading"].includes(rule.group))) throw new Error("Invalid playbook.");
      update.playbook = rules;
    }
    if (Object.keys(update).length === 0) throw new Error("Nothing to update.");
    const [settings] = await db.update(journalSettings).set(update).where(eq(journalSettings.id, 1)).returning();
    return Response.json(settings);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Couldn't save your changes." }, { status: 400 });
  }
}
