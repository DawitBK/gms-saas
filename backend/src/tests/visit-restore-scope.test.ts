import { afterEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import app from '../app';
import { appConfig } from '../config/app.config';
import { Office, Department, Visit, User } from '../infrastructure/database/models';

// FIX regression coverage: VisitService.restoreVisit used to accept an
// `actor` parameter but never check it, so an office-scoped admin could
// restore ANY office's soft-deleted visit — not just their own. archiveVisit
// already enforced this scope; restoreVisit now mirrors it via
// getVisitForActorIncludingDeleted (a paranoid:false-tolerant variant, since
// the visit is by definition already soft-deleted by the time restore runs).

const makeToken = (payload: { id: number; roles?: string[]; office_id?: number }) =>
  jwt.sign(payload, appConfig.jwt.secret as string);

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Visit restore authorization scope', () => {
  it('blocks an out-of-scope office admin from restoring another office\'s soft-deleted visit, but allows the in-scope admin', async () => {
    const stamp = Date.now();

    const officeA = await Office.create({
      name: `Restore Office A ${stamp}`,
      address: '1 Restore St',
      city: 'X',
      country: 'Y',
      timezone: 'UTC',
      active: true,
      latitude: 40.7128,
      longitude: -74.0060,
    });
    const officeB = await Office.create({
      name: `Restore Office B ${stamp}`,
      address: '2 Restore St',
      city: 'X',
      country: 'Y',
      timezone: 'UTC',
      active: true,
      latitude: 40.7128,
      longitude: -74.0060,
    });
    const department = await Department.create({ name: `Restore Dept ${stamp}`, office_id: officeA.id });
    const guestUser = await User.create({
      full_name: 'Restore Guest',
      email: `restore-guest-${stamp}@example.test`,
    });
    const adminAUser = await User.create({
      full_name: 'Restore Admin A',
      email: `restore-admin-a-${stamp}@example.test`,
    });
    const adminBUser = await User.create({
      full_name: 'Restore Admin B',
      email: `restore-admin-b-${stamp}@example.test`,
    });

    const visit = await Visit.create({
      guest_id: guestUser.id,
      department_id: department.id,
      office_id: officeA.id,
      status: 'PENDING',
      scheduled_start: new Date('2026-05-01T10:00:00.000Z'),
      scheduled_end: new Date('2026-05-01T11:00:00.000Z'),
      qr_code: randomUUID(),
      purpose: 'restore scope test',
    });

    const adminAToken = makeToken({ id: adminAUser.id, roles: ['admin'], office_id: Number(officeA.id) });
    const adminBToken = makeToken({ id: adminBUser.id, roles: ['admin'], office_id: Number(officeB.id) });

    try {
      // Archive (soft-delete) as the in-scope admin, same as normal usage.
      const archiveRes = await request(app)
        .delete(`/api/v1/visits/${visit.id}`)
        .set('Authorization', `Bearer ${adminAToken}`);
      expect(archiveRes.status).toBe(200);

      const afterArchive = await Visit.findByPk(visit.id, { paranoid: false });
      expect(afterArchive?.get('deleted_at')).not.toBeNull();

      // Out-of-scope admin (different office) must be rejected.
      const wrongOfficeRestoreRes = await request(app)
        .post(`/api/v1/visits/${visit.id}/restore`)
        .set('Authorization', `Bearer ${adminBToken}`);
      expect(wrongOfficeRestoreRes.status).toBe(403);

      const stillDeleted = await Visit.findByPk(visit.id, { paranoid: false });
      expect(stillDeleted?.get('deleted_at')).not.toBeNull();

      // In-scope admin (same office as the visit) succeeds.
      const correctOfficeRestoreRes = await request(app)
        .post(`/api/v1/visits/${visit.id}/restore`)
        .set('Authorization', `Bearer ${adminAToken}`);
      expect(correctOfficeRestoreRes.status).toBe(200);

      const restored = await Visit.findByPk(visit.id, { paranoid: false });
      expect(restored?.get('deleted_at')).toBeNull();
    } finally {
      await Visit.destroy({ where: { id: visit.id }, force: true });
      await Department.destroy({ where: { id: department.id } });
      await Office.destroy({ where: { id: [officeA.id, officeB.id] } });
      await User.destroy({ where: { id: [guestUser.id, adminAUser.id, adminBUser.id] } });
    }
  });
});
