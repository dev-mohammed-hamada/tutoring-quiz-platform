import { pool } from './db/pool.js';

/**
 * Closes attempts whose deadline passed without a submit - the student who shut
 * their phone and never came back.
 *
 * Answers are already graded at save time, so the total is a plain aggregate and
 * nothing needs re-scoring. The attempt is stamped at its own expires_at rather
 * than at sweep time, so a sweep that runs late does not misreport when the
 * attempt actually ended.
 *
 * One statement, and the WHERE clause makes it idempotent: two processes running
 * it concurrently is harmless.
 */
export async function finalizeExpiredAttempts(): Promise<number> {
  const { rowCount } = await pool.query(`
    WITH totals AS (
      SELECT a.id, COALESCE(SUM(ans.points_awarded), 0)::int AS raw
        FROM attempts a
        LEFT JOIN answers ans ON ans.attempt_id = a.id
       WHERE a.submitted_at IS NULL AND a.expires_at < now()
       GROUP BY a.id
    )
    UPDATE attempts a
       SET submitted_at     = a.expires_at,
           submitted_reason = 'expired',
           raw_score        = t.raw,
           display_score    = GREATEST(0, t.raw)
      FROM totals t
     WHERE a.id = t.id AND a.submitted_at IS NULL
  `);
  return rowCount ?? 0;
}

export function startSweeper(intervalMs = 60_000): NodeJS.Timeout {
  const timer = setInterval(() => {
    finalizeExpiredAttempts().catch((err) => console.error('sweeper failed', err));
  }, intervalMs);
  timer.unref();   // never hold the process open
  return timer;
}
