import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
if (!process.env.DATABASE_URL) { console.error("Set DATABASE_URL before running this migration."); process.exit(1); }
const migration = fileURLToPath(new URL("../migrations/0001_bloom_private.sql", import.meta.url));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try { await pool.query(await readFile(migration, "utf8")); console.log("Private journal tables are ready. Existing shared tables were not modified."); }
catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
finally { await pool.end(); }
