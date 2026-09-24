import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Applies any migration not yet recorded. Each runs in its own transaction. */
export async function migrate(): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations(
       name text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now())`);

  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const { rowCount } = await pool.query(`SELECT 1 FROM schema_migrations WHERE name=$1`, [file]);
    if (rowCount) continue;

    const sql = await readFile(join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations(name) VALUES ($1)`, [file]);
      await client.query('COMMIT');
      console.log(`migrated ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`migration ${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
}
