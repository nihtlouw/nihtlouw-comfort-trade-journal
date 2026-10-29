import { bigint, boolean, customType, date, doublePrecision, index, integer, jsonb, numeric, pgTable, primaryKey, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import type { JournalData, PlaybookRule } from "@/lib/types";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

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

// Private, per-user storage. The original shared tables above are left untouched
// so existing installations can export them deliberately before migrating.

export const user = pgTable("bloom_auth_user", {
  id: text("id").primaryKey(), name: text("name").notNull(), email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false), image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const session = pgTable("bloom_auth_session", {
  id: text("id").primaryKey(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(), ipAddress: text("ip_address"), userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (table) => [index("bloom_auth_session_user_idx").on(table.userId)]);
export const account = pgTable("bloom_auth_account", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull(), providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"), refreshToken: text("refresh_token"), idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }), refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"), password: text("password"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("bloom_auth_account_user_idx").on(table.userId)]);
export const verification = pgTable("bloom_auth_verification", {
  id: text("id").primaryKey(), identifier: text("identifier").notNull(), value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("bloom_auth_verification_identifier_idx").on(table.identifier)]);
export const rateLimit = pgTable("bloom_auth_rate_limit", {
  id: text("id").primaryKey(), key: text("key").notNull().unique(), count: integer("count").notNull(), lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
export const privateJournals = pgTable("bloom_private_journals", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull().default(0), data: jsonb("data").$type<JournalData>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const journalImages = pgTable("bloom_journal_images", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(), type: text("type").notNull(), size: integer("size").notNull(), data: text("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("bloom_journal_images_user_idx").on(table.userId)]);

export const audioTracks = pgTable("bloom_audio_tracks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  durationSec: doublePrecision("duration_sec"),
  sortOrder: integer("sort_order").notNull().default(0),
  chunkSize: integer("chunk_size").notNull(),
  expectedChunks: integer("expected_chunks").notNull(),
  status: text("status").notNull().default("uploading"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("bloom_audio_tracks_user_idx").on(table.userId)]);

export const audioChunks = pgTable("bloom_audio_chunks", {
  trackId: text("track_id").notNull().references(() => audioTracks.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  size: integer("size").notNull(),
  data: bytea("data").notNull(),
}, (table) => [primaryKey({ columns: [table.trackId, table.chunkIndex] })]);
