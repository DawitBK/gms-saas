import request from 'supertest';
import app from '../app';
import { appConfig } from '../config/app.config';

describe('internal SSO bridge API', () => {
  const originalKey = appConfig.internalSso.apiKey;

  afterEach(() => {
    appConfig.internalSso.apiKey = originalKey;
  });

  it('remains disabled until an explicit service key is configured', async () => {
    appConfig.internalSso.apiKey = undefined;

    const response = await request(app)
      .post('/api/v1/internal/sso/sessions')
      .send({ email: 'staff@examplecorp.com' });

    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
  });

  it('rejects missing or incorrect keys before touching user data', async () => {
    appConfig.internalSso.apiKey = 'a'.repeat(32);

    const response = await request(app)
      .post('/api/v1/internal/sso/sessions')
      .set('x-internal-api-key', 'b'.repeat(32))
      .send({ email: 'staff@examplecorp.com' });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('AUTH_UNAUTHORIZED');
  });

  it('protects the internal office and user-status reads with the same shared key', async () => {
    appConfig.internalSso.apiKey = 'a'.repeat(32);

    const [offices, status] = await Promise.all([
      request(app)
        .get('/api/v1/internal/sso/offices')
        .set('x-internal-api-key', 'b'.repeat(32)),
      request(app)
        .get('/api/v1/internal/sso/users/by-email/staff%40examplecorp.com/status')
        .set('x-internal-api-key', 'b'.repeat(32)),
    ]);

    expect(offices.status).toBe(401);
    expect(offices.body.success).toBe(false);
    expect(status.status).toBe(401);
    expect(status.body.success).toBe(false);
  });
});
