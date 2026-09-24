import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { resetDb } from './helpers/db.js';
import { makeWorld, loginAs } from './helpers/world.js';

const app = createApp();
beforeAll(async () => { await migrate(); });
beforeEach(async () => { await resetDb(); await makeWorld(); });
afterAll(async () => { await pool.end(); });

const HEADER = 'login_code,full_name,class_name,password,locale\n';

describe('principal administration', () => {
  it('refuses every admin route to a teacher and to a student', async () => {
    for (const who of ['teacher-samir', '10A-001']) {
      const agent = await loginAs(app, who);
      expect((await agent.get('/api/admin/users')).status).toBe(403);
      expect((await agent.get('/api/admin/classes')).status).toBe(403);
      expect((await agent.post('/api/admin/classes').send({ name: 'X' })).status).toBe(403);
      expect((await agent.post('/api/admin/import').send({ kind: 'students', csv: HEADER })).status).toBe(403);
    }
  });

  it('lists classes with their student counts', async () => {
    const principal = await loginAs(app, 'principal');
    const res = await principal.get('/api/admin/classes');
    expect(res.body.find((c: { name: string }) => c.name === '10A')).toMatchObject({ studentCount: 2 });
  });

  it('creates a class, and refuses a duplicate name', async () => {
    const principal = await loginAs(app, 'principal');
    expect((await principal.post('/api/admin/classes').send({ name: '12B' })).status).toBe(201);
    expect((await principal.post('/api/admin/classes').send({ name: '12B' })).status).toBe(409);
  });

  it('lists users without ever exposing password hashes', async () => {
    const principal = await loginAs(app, 'principal');
    const res = await principal.get('/api/admin/users');
    expect(res.body.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toMatch(/password|scrypt/i);
  });

  it('creates a student who can then log in with the issued credentials', async () => {
    const principal = await loginAs(app, 'principal');
    const created = await principal.post('/api/admin/users').send({
      role: 'student', fullName: 'سلمى قاسم', loginCode: '10A-099',
      password: 'pass1234', locale: 'ar', classId: 1,
    });
    expect(created.status).toBe(201);
    const agent = await loginAs(app, '10A-099');
    expect((await agent.get('/api/me')).body).toMatchObject({ role: 'student', fullName: 'سلمى قاسم' });
  });

  it('refuses a student without a class', async () => {
    const principal = await loginAs(app, 'principal');
    const res = await principal.post('/api/admin/users').send({
      role: 'student', fullName: 'X', loginCode: 'x-1', password: 'pass1234', locale: 'en',
    });
    expect(res.status).toBe(400);
  });

  it('refuses a duplicate login code', async () => {
    const principal = await loginAs(app, 'principal');
    const res = await principal.post('/api/admin/users').send({
      role: 'student', fullName: 'Dup', loginCode: '10A-001', password: 'pass1234', locale: 'en', classId: 1,
    });
    expect(res.status).toBe(409);
  });

  it('resets a password and revokes the user\'s existing sessions', async () => {
    const student = await loginAs(app, '10A-001');
    const principal = await loginAs(app, 'principal');
    const { rows: [u] } = await pool.query(`SELECT id FROM users WHERE login_code='10A-001'`);
    const res = await principal.put(`/api/admin/users/${u.id}/password`).send({ password: 'newpass99' });
    expect(res.status).toBe(204);
    expect((await student.get('/api/me')).status).toBe(401);          // old session is dead
    const fresh = await loginAs(app, '10A-001').catch(() => null);
    expect(fresh).toBeNull();                                          // old password rejected
  });

  it("replaces a teacher's class assignments rather than appending to them", async () => {
    const principal = await loginAs(app, 'principal');
    const { rows: [t] } = await pool.query(`SELECT id FROM users WHERE login_code='teacher-samir'`);
    const res = await principal.post('/api/admin/assignments').send({ teacherId: t.id, classIds: [3] });
    expect(res.status).toBe(200);
    const { rows } = await pool.query(
      `SELECT class_id FROM teacher_classes WHERE teacher_id=$1 ORDER BY class_id`, [t.id]);
    expect(rows.map(r => r.class_id)).toEqual([3]);
  });

  it('refuses to assign classes to a student', async () => {
    const principal = await loginAs(app, 'principal');
    const { rows: [s] } = await pool.query(`SELECT id FROM users WHERE login_code='10A-001'`);
    const res = await principal.post('/api/admin/assignments').send({ teacherId: s.id, classIds: [1] });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/import', () => {
  it('imports students from the same CSV shape the seeder reads', async () => {
    const principal = await loginAs(app, 'principal');
    const res = await principal.post('/api/admin/import').send({
      kind: 'students', csv: HEADER + '10A-050,سلمى قاسم,10A,pass1234,ar\n' });
    expect(res.body).toMatchObject({ created: 1, updated: 0, errors: [] });
    const { rows } = await pool.query(`SELECT full_name, class_id FROM users WHERE login_code='10A-050'`);
    expect(rows[0]).toEqual({ full_name: 'سلمى قاسم', class_id: 1 });
  });

  it('updates an existing student in place rather than duplicating', async () => {
    const principal = await loginAs(app, 'principal');
    const res = await principal.post('/api/admin/import').send({
      kind: 'students', csv: HEADER + '10A-001,ليلى حداد الجديدة,10B,pass1234,ar\n' });
    expect(res.body).toMatchObject({ created: 0, updated: 1 });
    const { rows } = await pool.query(`SELECT full_name, class_id FROM users WHERE login_code='10A-001'`);
    expect(rows[0]).toEqual({ full_name: 'ليلى حداد الجديدة', class_id: 2 });
  });

  it('never overwrites an existing password when the roster is re-imported', async () => {
    const principal = await loginAs(app, 'principal');
    // The roster is re-sent with a different password column. The student must
    // still be able to log in with the password they already had.
    await principal.post('/api/admin/import').send({
      kind: 'students', csv: HEADER + '10A-001,ليلى حداد,10A,a-different-password,ar\n' });
    await expect(loginAs(app, '10A-001')).resolves.toBeTruthy();   // pass1234 still works
  });

  it('refuses to turn a staff account into a student via import', async () => {
    const principal = await loginAs(app, 'principal');
    const res = await principal.post('/api/admin/import').send({
      kind: 'students', csv: HEADER + 'teacher-samir,Impostor,10A,pass1234,en\n' });
    expect(res.body.updated).toBe(0);
    expect(res.body.errors[0].message).toMatch(/different kind of account/);
    const { rows } = await pool.query(`SELECT role FROM users WHERE login_code='teacher-samir'`);
    expect(rows[0].role).toBe('teacher');
  });

  it('reports the line number of a bad row and still imports the good ones', async () => {
    const principal = await loginAs(app, 'principal');
    const res = await principal.post('/api/admin/import').send({
      kind: 'students',
      csv: HEADER + 'X-1,Good Row,10A,pass1234,en\nX-2,Bad Row,99Z,pass1234,en\nX-3,Also Good,11A,pass1234,en\n',
    });
    expect(res.body.created).toBe(2);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0]).toMatchObject({ line: 3 });
    expect(res.body.errors[0].message).toMatch(/99Z/);
  });

  it('handles quoted fields containing commas', async () => {
    const principal = await loginAs(app, 'principal');
    const res = await principal.post('/api/admin/import').send({
      kind: 'students', csv: HEADER + '10A-051,"Haddad, Dana",10A,pass1234,en\n' });
    expect(res.body.created).toBe(1);
    const { rows } = await pool.query(`SELECT full_name FROM users WHERE login_code='10A-051'`);
    expect(rows[0].full_name).toBe('Haddad, Dana');
  });

  it('imports teachers', async () => {
    const principal = await loginAs(app, 'principal');
    const res = await principal.post('/api/admin/import').send({
      kind: 'teachers',
      csv: 'login_code,full_name,role,password,locale\nt-new,هالة سليمان,teacher,pass1234,ar\n',
    });
    expect(res.body.created).toBe(1);
  });

  it('rejects a file whose header is missing a required column', async () => {
    const principal = await loginAs(app, 'principal');
    const res = await principal.post('/api/admin/import').send({
      kind: 'students', csv: 'login_code,full_name\n10A-060,Someone\n' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('missing_columns');
  });
});
