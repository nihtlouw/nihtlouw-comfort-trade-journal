import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
import { writeFile } from "node:fs/promises";
import pg from "pg";

const target = process.argv[2];
if (!target || !process.env.DATABASE_URL) {
  console.error("Usage: DATABASE_URL=... npm run export:legacy -- /secure/path/bloom-legacy-backup.json");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const [settingsResult, tradesResult] = await Promise.all([
    pool.query("SELECT id, name, mood, mood_date, goal, goal_progress, goal_target, playbook FROM journal_settings WHERE id = 1"),
    pool.query("SELECT id, symbol, market, side, setup, trade_date, pnl, mood, notes, is_demo FROM trades ORDER BY trade_date DESC, id DESC"),
  ]);
  const settings = settingsResult.rows[0];
  if (!settings) throw new Error("No legacy shared journal was found. No file was written.");
  const date = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : value;
  const journal = {
    settings: { id: 1, name: settings.name, mood: settings.mood, moodDate: settings.mood_date ? date(settings.mood_date) : null, goal: settings.goal, goalProgress: settings.goal_progress, goalTarget: settings.goal_target, playbook: settings.playbook },
    trades: tradesResult.rows.map((row) => ({ id: row.id, symbol: row.symbol, market: row.market, side: row.side, setup: row.setup, tradeDate: date(row.trade_date), pnl: String(row.pnl), mood: row.mood, notes: row.notes, isDemo: row.is_demo })),
  };
  const backup = { format: "bloom-journal-backup", version: 2, exportedAt: new Date().toISOString(), journal, images: [] };
  await writeFile(target, JSON.stringify(backup, null, 2), { flag: "wx", mode: 0o600 });
  console.log(`Exported ${journal.trades.length} legacy trades to ${target}. This file is unencrypted; keep it private.`);
} catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
finally { await pool.end(); }
