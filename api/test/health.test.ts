import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('sets security headers', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
