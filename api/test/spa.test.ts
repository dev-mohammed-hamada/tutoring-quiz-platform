import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';

/**
 * In production one Node process serves both the API and the built SPA. The
 * location of `web/dist` must not depend on the working directory: `npm run dev
 * -w api` runs with cwd=api/, `npm start` with cwd=repo root, and the container
 * with cwd=/app. All three have to find the same directory.
 */
const dist = mkdtempSync(join(tmpdir(), 'web-dist-'));
writeFileSync(join(dist, 'index.html'), '<!doctype html><title>app shell</title>');
writeFileSync(join(dist, 'robots.txt'), 'User-agent: *\n');

beforeAll(() => { process.env.WEB_DIST = dist; });
afterAll(async () => {
  delete process.env.WEB_DIST;
  rmSync(dist, { recursive: true, force: true });
  await pool.end();
});

describe('serving the SPA', () => {
  it('answers a client-side route with the app shell', async () => {
    const res = await request(createApp()).get('/quizzes');
    expect(res.status).toBe(200);
    expect(res.text).toContain('app shell');
  });

  it('serves static assets from the build', async () => {
    const res = await request(createApp()).get('/robots.txt');
    expect(res.status).toBe(200);
    expect(res.text).toContain('User-agent');
  });

  it('never answers an unknown /api path with the shell', async () => {
    const res = await request(createApp()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('app shell');
  });

  it('still routes real API paths to the API', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('serves no shell at all when the SPA has not been built', async () => {
    delete process.env.WEB_DIST;
    process.env.WEB_DIST = join(dist, 'does-not-exist');
    const res = await request(createApp()).get('/quizzes');
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('app shell');
    process.env.WEB_DIST = dist;
  });
});
