import { pool } from '../../src/db/pool.js';

/** Truncate everything between tests. Order is irrelevant with CASCADE. */
export async function resetDb(): Promise<void> {
  await pool.query(`TRUNCATE answers, attempts, options, questions, quiz_classes, quizzes,
                    teacher_classes, sessions, users, classes RESTART IDENTITY CASCADE`);
}
