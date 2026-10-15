import { afterEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import app from '../app';
import { appConfig } from '../config/app.config';
import { Office, Department, Host, Visit, User, Message } from '../infrastructure/database/models';

const makeToken = (payload: { id: number; roles?: string[]; office_id?: number }) =>
  jwt.sign(payload, appConfig.jwt.secret as string);

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Visit messages routes', () => {
  it('returns 403 for a user who is not a chat participant', async () => {
    const office = await Office.create({
      name: 'Msg Office',
      address: '1 Chat St',
      city: 'X',
      country: 'Y',
      timezone: 'UTC',
      active: true,
      latitude: 40.7128,
      longitude: -74.0060,
    });
    const department = await Department.create({ name: 'Msg Dept', office_id: office.id });
    const guestUser = await User.create({
      full_name: 'Msg Guest',
      email: `msg-guest-${Date.now()}@example.test`,
    });
    const stranger = await User.create({
      full_name: 'Stranger',
      email: `msg-stranger-${Date.now()}@example.test`,
    });
    const hostUser = await User.create({
      full_name: 'Msg Host',
      email: `msg-host-${Date.now()}@example.test`,
    });
    const host = await Host.create({
      user_id: hostUser.id,
      department_id: department.id,
      office_id: office.id,
      active: true,
    });

    const visit = await Visit.create({
      guest_id: guestUser.id,
      department_id: department.id,
      office_id: office.id,
      assigned_host_id: host.id,
      status: 'PENDING',
      scheduled_start: new Date('2026-05-01T10:00:00.000Z'),
      scheduled_end: new Date('2026-05-01T11:00:00.000Z'),
      qr_code: randomUUID(),
      purpose: 'chat route test',
    });

    const token = makeToken({ id: stranger.id, roles: ['guest'] });
    const res = await request(app)
      .get(`/api/v1/visits/${visit.id}/messages`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);

    await Message.destroy({ where: { visit_id: visit.id } });
    // force: visits.office_id is ON DELETE RESTRICT since migration 20260904000000,
    // so a soft-deleted visit still blocks the Office.destroy below. This cleanup
    // previously relied on CASCADE removing the row for it.
    await visit.destroy({ force: true });
    await Host.destroy({ where: { id: host.id } });
    await Department.destroy({ where: { id: department.id }, force: true });
    await Office.destroy({ where: { id: office.id }, force: true });
    await User.destroy({ where: { id: [guestUser.id, stranger.id, hostUser.id] }, force: true });
  });

  it('lets the guest list and post messages', async () => {
    const office = await Office.create({
      name: 'Msg Office 2',
      address: '2 Chat St',
      city: 'X',
      country: 'Y',
      timezone: 'UTC',
      active: true,
      latitude: 40.7128,
      longitude: -74.0060,
    });
    const department = await Department.create({ name: 'Msg Dept 2', office_id: office.id });
    const guestUser = await User.create({
      full_name: 'Msg Guest 2',
      email: `msg-guest2-${Date.now()}@example.test`,
    });
    const hostUser = await User.create({
      full_name: 'Msg Host 2',
      email: `msg-host2-${Date.now()}@example.test`,
    });
    const host = await Host.create({
      user_id: hostUser.id,
      department_id: department.id,
      office_id: office.id,
      active: true,
    });

    const visit = await Visit.create({
      guest_id: guestUser.id,
      department_id: department.id,
      office_id: office.id,
      assigned_host_id: host.id,
      status: 'PENDING',
      scheduled_start: new Date('2026-05-02T10:00:00.000Z'),
      scheduled_end: new Date('2026-05-02T11:00:00.000Z'),
      qr_code: randomUUID(),
      purpose: 'chat post test',
    });

    const token = makeToken({ id: guestUser.id, roles: ['guest'] });

    const listRes = await request(app)
      .get(`/api/v1/visits/${visit.id}/messages`)
      .set('Authorization', `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.data)).toBe(true);

    const postRes = await request(app)
      .post(`/api/v1/visits/${visit.id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Hello host from guest' });

    expect(postRes.status).toBe(201);
    expect(postRes.body.data.content).toBe('Hello host from guest');

    await Message.destroy({ where: { visit_id: visit.id } });
    // force: visits.office_id is ON DELETE RESTRICT since migration 20260904000000,
    // so a soft-deleted visit still blocks the Office.destroy below. This cleanup
    // previously relied on CASCADE removing the row for it.
    await visit.destroy({ force: true });
    await Host.destroy({ where: { id: host.id } });
    await Department.destroy({ where: { id: department.id }, force: true });
    await Office.destroy({ where: { id: office.id }, force: true });
    await User.destroy({ where: { id: [guestUser.id, hostUser.id] }, force: true });
  });
});
