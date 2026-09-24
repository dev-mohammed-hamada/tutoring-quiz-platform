import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { hashPassword, verifyPassword } from '../src/auth/password.js';
import { resetDb } from './helpers/db.js';

const app = createApp();
beforeAll(async () => { await migrate(); });
beforeEach(async () => {
  await resetDb();
  const { rows: [c] } = await pool.query(`INSERT INTO classes(name) VALUES ('10A') RETURNING id`);
  await pool.query(
    `INSERT INTO users(role, full_name, login_code, password_hash, class_id)
     VALUES ('student','ليلى حداد','10A-001',$1,$2)`,
    [await hashPassword('pass1234'), c.id]);
});
afterAll(async () => { await pool.end(); });

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const stored = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', stored)).toBe(true);
    expect(await verifyPassword('wrong horse', stored)).toBe(false);
  });

  it('produces a different hash each time, so equal passwords are not detectable', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('rejects a malformed stored hash rather than throwing', async () => {
    expect(await verifyPassword('x', 'garbage')).toBe(false);
    expect(await verifyPassword('x', '')).toBe(false);
  });
});

describe('POST /api/auth/login', () => {
  it('sets an httpOnly, SameSite session cookie on success', async () => {
    const res = await request(app).post('/api/auth/login').send({ loginCode: '10A-001', password: 'pass1234' });
    expect(res.status).toBe(200);
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('never returns the password hash', async () => {
    const res = await request(app).post('/api/auth/login').send({ loginCode: '10A-001', password: 'pass1234' });
    expect(JSON.stringify(res.body)).not.toMatch(/password|scrypt/i);
    expect(res.body.user).toMatchObject({ role: 'student', fullName: 'ليلى حداد' });
  });

  it('rejects a wrong password with the same response as an unknown user', async () => {
    const bad = await request(app).post('/api/auth/login').send({ loginCode: '10A-001', password: 'wrong' });
    const missing = await request(app).post('/api/auth/login').send({ loginCode: 'nobody', password: 'wrong' });
    expect(bad.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(bad.body).toEqual(missing.body);   // no user enumeration
  });

  it('refuses a deactivated user', async () => {
    await pool.query(`UPDATE users SET is_active = false WHERE login_code='10A-001'`);
    const res = await request(app).post('/api/auth/login').send({ loginCode: '10A-001', password: 'pass1234' });
    expect(res.status).toBe(401);
  });

  it('rejects a malformed body with 400 before touching the database', async () => {
    expect((await request(app).post('/api/auth/login').send({ loginCode: 123 })).status).toBe(400);
    expect((await request(app).post('/api/auth/login').send({})).status).toBe(400);
  });
});

describe('GET /api/me', () => {
  it('is 401 without a session', async () => {
    expect((await request(app).get('/api/me')).status).toBe(401);
  });

  it('is 401 with a forged cookie', async () => {
    const res = await request(app).get('/api/me').set('Cookie', 'qsid=not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('returns the signed-in user with a session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ loginCode: '10A-001', password: 'pass1234' });
    const res = await agent.get('/api/me');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ role: 'student', locale: 'ar', fullName: 'ليلى حداد' });
    expect(typeof res.body.classId).toBe('number');
  });

  it('is 401 after logout, and the session row is gone', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ loginCode: '10A-001', password: 'pass1234' });
    await agent.post('/api/auth/logout');
    expect((await agent.get('/api/me')).status).toBe(401);
    const { rows } = await pool.query(`SELECT count(*)::int c FROM sessions`);
    expect(rows[0].c).toBe(0);
  });

  it('stores only a hash of the token, never the token itself', async () => {
    const res = await request(app).post('/api/auth/login').send({ loginCode: '10A-001', password: 'pass1234' });
    const token = /qsid=([^;]+)/.exec((res.headers['set-cookie'] as unknown as string[])[0]!)![1]!;
    const { rows } = await pool.query(`SELECT id FROM sessions`);
    expect(rows[0].id).not.toBe(token);
    expect(rows[0].id).toMatch(/^[0-9a-f]{64}$/);
  });
});
