/**
 * Incident containment in GMS (incident.lock.ts, incident.guard.ts). A bare Express app with the real guard and the real error handler, a real temporary
 * lock file: no database, no Redis.
 *
 * Proves: no lock = nothing changes; with a lock every non-exempt POST/PUT/PATCH/DELETE answers 403 INCIDENT_READ_ONLY; reads, sign-in/sign-out, health,
 * the licence routes and the SSO bridge keep working; every READ_ONLY_ALLOWLIST and LICENSE_REQUIRED_EXEMPT entry is honoured; the lock is cached for about
 * three seconds; junk content still locks; an unreadable path fails open; the guard never throws.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { errorHandler } from '../../shared/middleware/errorHandler';
import { createIncidentGuard } from './incident.guard';
import { readIncidentLock, resetIncidentLockCache } from './incident.lock';
import { LICENSE_REQUIRED_EXEMPT, READ_ONLY_ALLOWLIST } from './license.routing';

let dir = '';
let lockFile = '';
let app: express.Express;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gms-incident-'));
  lockFile = path.join(dir, 'incident.lock');
  app = express();
  app.use(createIncidentGuard(() => readIncidentLock(lockFile)));
  app.use((_req, res) => res.json({ reached: true }));
  app.use(errorHandler);
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  fs.rmSync(lockFile, { force: true });
  resetIncidentLockCache();
});

const lock = (body = JSON.stringify({ at: new Date().toISOString(), reason: 'audit_chain_broken', kind: 'audit_chain_broken' })) => {
  fs.writeFileSync(lockFile, body);
  resetIncidentLockCache();
};
type M = 'get' | 'post' | 'put' | 'patch' | 'delete';
const send = (method: M, p: string) => request(app)[method](p).send(method === 'get' ? undefined : {});
const code = (res: request.Response): string | undefined => res.body?.error?.code ?? res.body?.code;

describe('with no lock', () => {
  it('lets every method through', async () => {
    for (const m of ['get', 'post', 'put', 'patch', 'delete'] as M[]) expect((await send(m, '/visits')).status).toBe(200);
  });
});

describe('with a lock file', () => {
  it.each([
    ['post', '/visits'],
    ['put', '/users/abc'],
    ['patch', '/visits/1/approve'],
    ['delete', '/guests/1'],
    ['post', '/auth/register'],
    ['post', '/integrations/unifi/webhook'],
  ] as Array<[M, string]>)('refuses %s %s with 403 INCIDENT_READ_ONLY', async (m, p) => {
    lock();
    const res = await send(m, p);
    expect(res.status).toBe(403);
    expect(code(res)).toBe('INCIDENT_READ_ONLY');
  });

  it('keeps reads working', async () => {
    lock();
    for (const p of ['/visits', '/users', '/license/status']) expect((await send('get', p)).status).toBe(200);
  });

  it('keeps sign-in, sign-out, the licence routes, the SSO bridge and health working', async () => {
    lock();
    for (const p of ['/auth/login', '/auth/logout', '/auth/refresh', '/auth/verify-2fa', '/license/install', '/license/status', '/internal/sso/session', '/health']) {
      expect((await send('post', p)).status).toBe(200);
    }
  });

  // One concrete path per allowlist / exemption entry (written out, so a new entry without a line here fails the count checks below).
  const ALLOWLIST_PATHS: Array<[M, string]> = [
    ['post', '/auth/login'], ['post', '/auth/logout'], ['post', '/auth/refresh'], ['post', '/auth/verify-2fa'], ['post', '/auth/forgot-password'],
    ['post', '/auth/reset-password'], ['post', '/auth/change-password'], ['post', '/auth/toggle-2fa'], ['post', '/auth/verify-password'],
    ['put', '/internal/sso/session'], ['post', '/ocr/scan'], ['post', '/license/install'],
  ];
  const EXEMPT_PATHS = ['/health', '/license/status', '/license/install', '/auth/login', '/auth/verify-2fa', '/auth/refresh', '/auth/logout', '/auth/me', '/internal/sso/x'];

  it('covers every licence read-only allowlist entry and every licence-required exemption with a concrete path', () => {
    for (const e of READ_ONLY_ALLOWLIST) expect(ALLOWLIST_PATHS.some(([m, p]) => e.pattern.test(p) && (e.methods === '*' || e.methods.includes(m.toUpperCase())))).toBe(true);
    for (const e of LICENSE_REQUIRED_EXEMPT) expect(EXEMPT_PATHS.some((p) => e.pattern.test(p))).toBe(true);
  });

  it.each(ALLOWLIST_PATHS)('honours the licence read-only allowlist: %s %s', async (m, p) => {
    lock();
    expect((await send(m, p)).status).toBe(200);
  });

  it.each(EXEMPT_PATHS.map((p) => [p]))('honours the licence-required exemption: %s', async (p) => {
    lock();
    expect((await send('post', p)).status).toBe(200);
  });

  it('lifts when the file is removed', async () => {
    lock();
    expect((await send('post', '/visits')).status).toBe(403);
    fs.rmSync(lockFile);
    resetIncidentLockCache();
    expect((await send('post', '/visits')).status).toBe(200);
  });

  it('caches the answer for about three seconds', () => {
    lock();
    const t0 = Date.now();
    expect(readIncidentLock(lockFile, t0)).not.toBeNull();
    fs.rmSync(lockFile);
    expect(readIncidentLock(lockFile, t0 + 2000)).not.toBeNull();
    expect(readIncidentLock(lockFile, t0 + 3500)).toBeNull();
  });

  it('still locks when the file holds junk, and fails open when the path cannot be inspected', () => {
    lock('not json');
    expect(readIncidentLock(lockFile)).toEqual({ at: null, reason: null, kind: null });
    expect(readIncidentLock(path.join(lockFile, 'nested', 'incident.lock'))).toBeNull();
    expect(readIncidentLock('')).toBeNull();
    expect(readIncidentLock(undefined)).toBeNull();
  });

  it('never throws: a failing lookup lets the request through', async () => {
    const bare = express();
    bare.use(createIncidentGuard(() => { throw new Error('boom'); }));
    bare.use((_req, res) => res.json({ reached: true }));
    expect((await request(bare).post('/visits').send({})).status).toBe(200);
  });
});
