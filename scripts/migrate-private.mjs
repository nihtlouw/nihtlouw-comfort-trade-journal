import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
if (!process.env.DATABASE_URL) { console.error("Set DATABASE_URL before running this migration."); process.exit(1); }
const migrationsDir = fileURLToPath(new URL("../migrations", import.meta.url));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    await pool.query(await readFile(join(migrationsDir, file), "utf8"));
  }
  console.log("Private journal and audio tables are ready. Existing shared tables were not modified.");
} catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
finally { await pool.end(); }
