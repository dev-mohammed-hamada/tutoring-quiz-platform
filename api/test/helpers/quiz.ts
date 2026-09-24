import { pool } from '../../src/db/pool.js';

interface Opts {
  classIds: number[];
  authorLogin?: string;
  timeLimitMinutes?: number;
  opensInDays?: number;
  closesInDays?: number;
  negativeMarking?: boolean;
  publish?: boolean;
  questions?: { points: number }[];
}

export interface BuiltQuiz {
  id: number;
  questions: { id: number; points: number; options: { id: number; isCorrect: boolean }[] }[];
}

/** Builds a quiz with N questions, four options each, the first option correct. */
export async function makeQuiz(o: Opts): Promise<BuiltQuiz> {
  const { rows: [author] } = await pool.query(
    `SELECT id FROM users WHERE login_code = $1`, [o.authorLogin ?? 'teacher-samir']);

  const { rows: [q] } = await pool.query(
    `INSERT INTO quizzes(title, author_id, language, time_limit_minutes, opens_at, closes_at,
                         negative_marking, is_published)
     VALUES ('Test', $1, 'en', $2, now() + ($3 || ' days')::interval,
             now() + ($4 || ' days')::interval, $5, $6)
     RETURNING id`,
    [author.id, o.timeLimitMinutes ?? 20, o.opensInDays ?? -1, o.closesInDays ?? 1,
     o.negativeMarking ?? false, o.publish ?? true]);

  for (const cid of o.classIds) {
    await pool.query(`INSERT INTO quiz_classes(quiz_id, class_id) VALUES ($1,$2)`, [q.id, cid]);
  }

  const specs = o.questions ?? [{ points: 100 }, { points: 200 }];
  const questions: BuiltQuiz['questions'] = [];
  for (const [i, spec] of specs.entries()) {
    const { rows: [qq] } = await pool.query(
      `INSERT INTO questions(quiz_id, position, text, points) VALUES ($1,$2,$3,$4) RETURNING id`,
      [q.id, i + 1, `Question ${i + 1}`, spec.points]);
    const options: { id: number; isCorrect: boolean }[] = [];
    for (let j = 0; j < 4; j++) {
      const { rows: [op] } = await pool.query(
        `INSERT INTO options(question_id, position, text, is_correct) VALUES ($1,$2,$3,$4) RETURNING id`,
        [qq.id, j + 1, `Option ${j + 1}`, j === 0]);
      options.push({ id: op.id, isCorrect: j === 0 });
    }
    questions.push({ id: qq.id, points: spec.points, options });
  }
  return { id: q.id, questions };
}
