/**
 * The suite must be re-runnable, and the one-attempt rule makes it stateful: a
 * student who sat a quiz in the last run cannot sit it again. So the e2e database
 * is rebuilt from the seed before every run.
 *
 * This goes through the API's own migrate and seed code rather than SQL of its
 * own, so the fixture can never drift from the real schema.
 */
export default async function globalSetup() {
  process.env.DATABASE_URL =
    process.env.E2E_DATABASE_URL ?? 'postgres://mohammedhamada@localhost:5432/quiz_e2e';

  const { pool } = await import('../api/src/db/pool.js');
  const { migrate } = await import('../api/src/db/migrate.js');
  const { seed } = await import('../api/src/seed/index.js');

  await migrate();
  // Truncate and then seed, rather than seed alone: seed() is a no-op once the
  // principal exists, which is exactly the state a second run begins in.
  await pool.query(`TRUNCATE answers, attempts, options, questions, quiz_classes, quizzes,
                    teacher_classes, sessions, users, classes RESTART IDENTITY CASCADE`);
  await seed();

  // The seed has some students sit some quizzes. The student spec needs one who
  // certainly has not, so this clears the one it signs in as.
  await pool.query(
    `DELETE FROM attempts WHERE student_id = (SELECT id FROM users WHERE login_code = $1)`,
    [E2E_STUDENT]);

  await pool.end();
}

/** Shared with the specs so the choice of fixture student is stated once. */
export const E2E_STUDENT = '10A-001';
