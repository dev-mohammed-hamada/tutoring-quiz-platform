import request from 'supertest';
import type { Express } from 'express';
import { pool } from '../../src/db/pool.js';
import { hashPassword } from '../../src/auth/password.js';

/**
 * A fixed cast used by every route suite. Classes get ids 1=10A, 2=10B, 3=11A
 * because resetDb restarts the identity sequences.
 *
 * Samir teaches 10A and 10B; Rana teaches 10A only. Both teach 10A, which is
 * precisely what makes the reporting intersection testable: Rana can author a
 * quiz for a class Samir also teaches, and Samir must still not see it.
 */
export async function makeWorld() {
  const hash = await hashPassword('pass1234');

  for (const name of ['10A', '10B', '11A']) {
    await pool.query(`INSERT INTO classes(name) VALUES ($1)`, [name]);
  }

  await pool.query(
    `INSERT INTO users(role, full_name, login_code, password_hash) VALUES
       ('teacher','Samir Odeh','teacher-samir',$1),
       ('teacher','رنا مصطفى','teacher-rana',$1),
       ('principal','نور العلي','principal',$1)`, [hash]);

  await pool.query(
    `INSERT INTO users(role, full_name, login_code, password_hash, class_id) VALUES
       ('student','ليلى حداد','10A-001',$1,1),
       ('student','عمر الخطيب','10A-002',$1,1),
       ('student','Dana Haddad','10B-001',$1,2),
       ('student','Yousef Ali','11A-001',$1,3)`, [hash]);

  await pool.query(
    `INSERT INTO teacher_classes(teacher_id, class_id)
       SELECT id, 1 FROM users WHERE login_code='teacher-samir'
       UNION ALL SELECT id, 2 FROM users WHERE login_code='teacher-samir'
       UNION ALL SELECT id, 1 FROM users WHERE login_code='teacher-rana'`);
}

export async function loginAs(app: Express, loginCode: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ loginCode, password: 'pass1234' });
  if (res.status !== 200) throw new Error(`login failed for ${loginCode}: ${res.status}`);
  return agent;
}
