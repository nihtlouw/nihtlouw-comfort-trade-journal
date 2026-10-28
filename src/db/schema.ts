import { boolean, date, integer, jsonb, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import type { PlaybookRule } from "@/lib/types";

export const trades = pgTable("trades", {
  id: serial("id").primaryKey(),
  symbol: varchar("symbol", { length: 24 }).notNull(),
  market: varchar("market", { length: 24 }).notNull(),
  side: varchar("side", { length: 8 }).$type<"Long" | "Short">().notNull(),
  setup: varchar("setup", { length: 80 }).notNull().default(""),
  tradeDate: date("trade_date").notNull(),
  pnl: numeric("pnl", { precision: 14, scale: 2 }).notNull(),
  mood: varchar("mood", { length: 24 }).notNull().default("Calm"),
  notes: text("notes").notNull().default(""),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const journalSettings = pgTable("journal_settings", {
  id: integer("id").primaryKey().default(1),
  name: varchar("name", { length: 40 }).notNull().default("friend"),
  mood: varchar("mood", { length: 24 }),
  moodDate: date("mood_date"),
  goal: varchar("goal", { length: 100 }).notNull().default("Stick to my trading plan"),
  goalProgress: integer("goal_progress").notNull().default(0),
  goalTarget: integer("goal_target").notNull().default(5),
  playbook: jsonb("playbook").$type<PlaybookRule[]>().notNull().default([]),
});
