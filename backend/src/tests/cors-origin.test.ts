import request from 'supertest';
import app from '../app';

describe('CORS local origin handling', () => {
  it('returns explicit CORS headers for localhost preflight requests', async () => {
    const res = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', 'http://localhost:7201')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:7201');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });

  it('allows localhost loopback origins for local browser tooling', async () => {
    const res = await request(app)
      .get('/api/v1/offices')
      .set('Origin', 'http://localhost:7201');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:7201');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('allows 127.0.0.1 loopback origins alongside localhost', async () => {
    const res = await request(app)
      .get('/api/v1/offices')
      .set('Origin', 'http://127.0.0.1:7201');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://127.0.0.1:7201');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});
