import { afterEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import { appConfig } from '../config/app.config';
import { VisitService } from '../modules/visits/visit.service';
import { ApprovalService } from '../modules/approvals/approval.service';

const makeToken = (payload: { id: number; roles?: string[]; office_id?: number }) =>
  jwt.sign(payload, appConfig.jwt.secret as string);

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Visit management routes', () => {
  it('updates visit status for a staff actor with the decoded auth context', async () => {
    const token = makeToken({ id: 41, roles: ['host'], office_id: 2 });
    const spy = jest
      .spyOn(VisitService.prototype, 'processStatusChange')
      .mockResolvedValue({ visit: { id: 55, status: 'IN_PROGRESS' }, changed: true } as any);

    const res = await request(app)
      .patch('/api/v1/visits/55/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'IN_PROGRESS' });

    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith(
      55,
      { id: 41, roles: ['host'], office_id: 2 },
      'IN_PROGRESS'
    );
    expect(res.body.data.status).toBe('IN_PROGRESS');
  });

  it('routes APPROVED through ApprovalService.decideVisit when the visit is still PENDING', async () => {
    const token = makeToken({ id: 41, roles: ['reception'], office_id: 2 });
    jest
      .spyOn(VisitService.prototype, 'getVisitForActor')
      .mockResolvedValue({ id: 55, status: 'PENDING' } as any);
    const decideSpy = jest
      .spyOn(ApprovalService.prototype, 'decideVisit')
      .mockResolvedValue({
        approval: { id: 1, visit_id: 55, status: 'APPROVED' },
        visit: { id: 55, status: 'APPROVED' },
      } as any);
    const transitionSpy = jest.spyOn(VisitService.prototype, 'processStatusChange');

    const res = await request(app)
      .patch('/api/v1/visits/55/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(200);
    expect(decideSpy).toHaveBeenCalledWith(
      55,
      { id: 41, roles: ['reception'], office_id: 2 },
      { decision: 'APPROVED' }
    );
    // The generic status route must never bypass decideVisit for an
    // approvable visit — that's exactly the "Approval row silently skipped"
    // gap this routing closes.
    expect(transitionSpy).not.toHaveBeenCalled();
    expect(res.body.data.status).toBe('APPROVED');
  });

  it('falls back to the plain transition for APPROVED when the visit is ESCALATED (decideVisit does not support that state)', async () => {
    const token = makeToken({ id: 41, roles: ['reception'], office_id: 2 });
    jest
      .spyOn(VisitService.prototype, 'getVisitForActor')
      .mockResolvedValue({ id: 55, status: 'ESCALATED' } as any);
    const decideSpy = jest.spyOn(ApprovalService.prototype, 'decideVisit');
    const transitionSpy = jest
      .spyOn(VisitService.prototype, 'processStatusChange')
      .mockResolvedValue({ visit: { id: 55, status: 'APPROVED' }, changed: true } as any);

    const res = await request(app)
      .patch('/api/v1/visits/55/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(200);
    expect(decideSpy).not.toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledWith(
      55,
      { id: 41, roles: ['reception'], office_id: 2 },
      'APPROVED'
    );
    expect(res.body.data.status).toBe('APPROVED');
  });

  it('reassigns a visit for reception staff', async () => {
    const token = makeToken({ id: 10, roles: ['reception'], office_id: 1 });
    const spy = jest
      .spyOn(VisitService.prototype, 'reassignVisit')
      .mockResolvedValue({
        id: 55,
        status: 'RESCHEDULED',
        routing: { assigned_host_id: 21, time_slot_id: 18 },
      } as any);

    const res = await request(app)
      .post('/api/v1/visits/55/reassign')
      .set('Authorization', `Bearer ${token}`)
      .send({ host_id: 21, time_slot_id: 18, note: 'Route to another available host' });

    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith(
      55,
      { id: 10, roles: ['reception'], office_id: 1 },
      expect.objectContaining({ host_id: 21, time_slot_id: 18 })
    );
    expect(res.body.data.status).toBe('RESCHEDULED');
  });

  it('blocks a guest from escalating a visit through staff-only controls', async () => {
    const token = makeToken({ id: 88, roles: ['guest'] });
    const spy = jest.spyOn(VisitService.prototype, 'escalateVisit');

    const res = await request(app)
      .post('/api/v1/visits/55/escalate')
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Front desk should take over' });

    expect(res.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('validates reschedule payloads before hitting the service layer', async () => {
    const token = makeToken({ id: 10, roles: ['reception'], office_id: 1 });
    const spy = jest.spyOn(VisitService.prototype, 'rescheduleVisit');

    const res = await request(app)
      .post('/api/v1/visits/55/reschedule')
      .set('Authorization', `Bearer ${token}`)
      .send({ time_slot_id: -1 });

    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });
});
