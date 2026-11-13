import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

describe('Health Check & Error Shell (GET /api/health & /api/v1/health)', () => {
  it('returns 200 OK with db status and version on /api/v1/health', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      db: 'ok',
      version: expect.any(String),
    });
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('returns 200 OK on alias /api/health', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      db: 'ok',
      version: expect.any(String),
    });
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('echoes client provided X-Request-Id header', async () => {
    const customId = 'custom-request-id-12345';
    const res = await request(app)
      .get('/api/v1/health')
      .set('X-Request-Id', customId);

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe(customId);
  });

  it('returns structured 404 NOT_FOUND for unknown routes without internal leak', async () => {
    const res = await request(app).get('/api/v1/non-existent-route');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toEqual({
      code: 'NOT_FOUND',
      message: expect.stringContaining('Route GET /api/v1/non-existent-route not found'),
      requestId: expect.any(String),
    });
    expect(res.headers['x-request-id']).toBeDefined();
    // Verify no stack trace or SQL leaks
    expect(JSON.stringify(res.body)).not.toContain('at ');
    expect(JSON.stringify(res.body)).not.toContain('SELECT');
  });

  it('returns structured 400 VALIDATION_ERROR for malformed JSON bodies', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"invalidJson": ');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Malformed JSON payload.',
      requestId: expect.any(String),
    });
  });
});

