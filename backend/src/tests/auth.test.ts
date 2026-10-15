import { afterEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import app from '../app';
import { AuthService } from '../modules/auth/auth.service';
import { requireAuth } from '../shared/middleware/auth.middleware';

afterEach(() => {
  jest.restoreAllMocks();
});

/**
 * Phase 14 — Auth endpoint integration tests
 * Uses supertest against the Express app directly (no server listen required).
 */
describe('POST /api/v1/auth/login', () => {
  it('returns 400 when body is missing fields', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email' }); // missing password

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'bad', password: 'pass123' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });
});

describe('GET /api/v1/health', () => {
  it('returns 200 with operational message', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Auth response contract', () => {
  it('sets refresh/csrf cookies on login and does not expose refreshToken in the response body', async () => {
    jest.spyOn(AuthService.prototype, 'login').mockResolvedValue({
      user: {
        id: 7,
        full_name: 'Test User',
        email: 'test@example.com',
        phone: '+1555900000000',
        office_id: null,
        status: 'ACTIVE',
        presence: 'ONLINE',
        roles: ['guest'],
        requires_password_change: false,
      },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'Password123' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBe('access-token');
    expect(res.body.data.refreshToken).toBeUndefined();

    const cookies = Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'] : [];
    expect(cookies.some((cookie: string) => cookie.startsWith('gms_refresh_token='))).toBe(true);
    expect(cookies.some((cookie: string) => cookie.startsWith('gms_csrf_token='))).toBe(true);
  });

  it('refreshes using cookies plus csrf and still keeps refreshToken out of the response body', async () => {
    jest.spyOn(AuthService.prototype, 'refreshSession').mockResolvedValue({
      user: {
        id: 9,
        full_name: 'Refresh User',
        email: 'refresh@example.com',
        phone: '+1555900000001',
        office_id: null,
        status: 'ACTIVE',
        presence: 'ONLINE',
        roles: ['admin'],
        requires_password_change: false,
      },
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['gms_refresh_token=refresh-cookie', 'gms_csrf_token=csrf-cookie'])
      .set('X-CSRF-Token', 'csrf-cookie')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBe('new-access-token');
    expect(res.body.data.refreshToken).toBeUndefined();

    const cookies = Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'] : [];
    expect(cookies.some((cookie: string) => cookie.startsWith('gms_refresh_token='))).toBe(true);
    expect(cookies.some((cookie: string) => cookie.startsWith('gms_csrf_token='))).toBe(true);
  });
});

describe('requireAuth selected role handling', () => {
  it('narrows request roles to the selected role header when it is part of the session', () => {
    const next = jest.fn() as unknown as NextFunction;
    const req = {
      headers: {
        authorization: 'Bearer test-token',
        'x-selected-role': 'guest',
      },
      log: { child: jest.fn(() => undefined) },
    } as unknown as Request;
    const res = {} as Response;

    jest.spyOn(jwt, 'verify').mockReturnValue({
      id: 44,
      email: 'multi-role@example.com',
      roles: ['guest', 'reception'],
      office_id: 2,
    } as never);

    requireAuth(req, res, next);

    expect(req.userRoles).toEqual(['guest']);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a selected role header when the role is not part of the session', () => {
    const next = jest.fn() as unknown as NextFunction;
    const req = {
      headers: {
        authorization: 'Bearer test-token',
        'x-selected-role': 'admin',
      },
      log: { child: jest.fn(() => undefined) },
    } as unknown as Request;
    const res = {} as Response;

    jest.spyOn(jwt, 'verify').mockReturnValue({
      id: 44,
      email: 'multi-role@example.com',
      roles: ['guest', 'reception'],
      office_id: 2,
    } as never);

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: 'Selected role is not available for this session',
      })
    );
  });
});
