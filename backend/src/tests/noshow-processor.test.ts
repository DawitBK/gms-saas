import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Visit, Host } from '../infrastructure/database/models';
import { NotificationDomainService } from '../modules/notifications/notification.service';
import * as outboxService from '../infrastructure/events/outbox.service';
import { VisitService } from '../modules/visits/visit.service';
import { processNoShowJob } from '../infrastructure/queue/workers/noshow.processor';

describe('processNoShowJob', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('no-ops when visit is missing', async () => {
    jest.spyOn(Visit, 'findByPk').mockResolvedValue(null);
    const update = jest.spyOn(Visit, 'update');

    await processNoShowJob(404);

    expect(update).not.toHaveBeenCalled();
  });

  it('no-ops when visit is not APPROVED', async () => {
    jest.spyOn(Visit, 'findByPk').mockResolvedValue({ status: 'PENDING' } as Visit);
    const update = jest.spyOn(Visit, 'update');

    await processNoShowJob(1);

    expect(update).not.toHaveBeenCalled();
  });

  it('no-ops when grace window has not elapsed', async () => {
    const futureGrace = new Date(Date.now() + 3600_000);
    jest.spyOn(Visit, 'findByPk').mockResolvedValue({
      status: 'APPROVED',
      grace_deadline_at: futureGrace,
      scheduled_end: new Date(),
      time_slot_id: null,
      office_id: 1,
    } as Visit);
    const update = jest.spyOn(Visit, 'update');

    await processNoShowJob(1);

    expect(update).not.toHaveBeenCalled();
  });

  it('marks APPROVED visit NO_SHOW via the real transition service (so credential expiry actually fires)', async () => {
    // FIX (regression coverage): processNoShowJob used to call a bare
    // Visit.update({status: 'NO_SHOW'}) directly, bypassing
    // VisitTransitionService.processStatusChange entirely — which is the
    // ONLY code path that enqueues ExpireVisitCredentials. That left a
    // no-show guest's physical door credential fully active with nothing in
    // the system ever revoking it. This test pins the fix: no-show now goes
    // through VisitService.processStatusChange (the same real orchestrator
    // checkin/approval/unifi-webhook already use), which is what actually
    // triggers slot release AND credential expiry.
    const pastGrace = new Date(Date.now() - 60_000);
    jest.spyOn(Visit, 'findByPk').mockResolvedValue({
      status: 'APPROVED',
      grace_deadline_at: pastGrace,
      scheduled_end: new Date(Date.now() - 120_000),
      time_slot_id: 88,
      office_id: 2,
      assigned_host_id: 5,
    } as Visit);
    const processStatusChange = jest
      .spyOn(VisitService.prototype, 'processStatusChange')
      .mockResolvedValue({ id: 42, status: 'NO_SHOW' } as any);
    jest.spyOn(Host, 'findByPk').mockResolvedValue({ user_id: 99 } as Host);

    jest.spyOn(NotificationDomainService.prototype, 'createNotification').mockResolvedValue(undefined as any);
    jest.spyOn(outboxService, 'publishEvent').mockResolvedValue(undefined as any);
    jest.spyOn(outboxService, 'enqueueJob').mockResolvedValue(undefined as any);

    await processNoShowJob(42);

    expect(processStatusChange).toHaveBeenCalledWith(
      42,
      { id: 0, roles: ['super_admin'] },
      'NO_SHOW',
    );
  });
});
