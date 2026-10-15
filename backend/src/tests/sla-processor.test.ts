import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Visit, Host } from '../infrastructure/database/models';
import { NotificationDomainService } from '../modules/notifications/notification.service';
import * as outboxService from '../infrastructure/events/outbox.service';
import { processSlaEnforcementJob } from '../infrastructure/queue/workers/sla.processor';

describe('processSlaEnforcementJob', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('no-ops when visit is missing', async () => {
    jest.spyOn(Visit, 'findByPk').mockResolvedValue(null);
    const update = jest.spyOn(Visit, 'update');

    await processSlaEnforcementJob(404);

    expect(update).not.toHaveBeenCalled();
  });

  it('no-ops when visit is not PENDING', async () => {
    jest.spyOn(Visit, 'findByPk').mockResolvedValue({ status: 'APPROVED' } as Visit);
    const update = jest.spyOn(Visit, 'update');

    await processSlaEnforcementJob(1);

    expect(update).not.toHaveBeenCalled();
  });

  it('no-ops when SLA deadline is still in the future', async () => {
    const future = new Date(Date.now() + 60_000);
    jest.spyOn(Visit, 'findByPk').mockResolvedValue({
      status: 'PENDING',
      sla_deadline_at: future,
    } as Visit);
    const update = jest.spyOn(Visit, 'update');

    await processSlaEnforcementJob(1);

    expect(update).not.toHaveBeenCalled();
  });

  it('escalates PENDING visit after SLA deadline and notifies host user', async () => {
    const past = new Date(Date.now() - 60_000);
    jest.spyOn(Visit, 'findByPk').mockResolvedValue({
      status: 'PENDING',
      sla_deadline_at: past,
      office_id: 9,
      assigned_host_id: 44,
    } as Visit);
    const update = jest.spyOn(Visit, 'update').mockResolvedValue([1] as any);
    jest.spyOn(Host, 'findByPk').mockResolvedValue({ user_id: 77 } as Host);

    const notify = jest.spyOn(NotificationDomainService.prototype, 'createNotification').mockResolvedValue(undefined as any);
    // Auto-escalation is a domain event (VISIT.ESCALATED), not a queue job — it
    // must reach reception dashboards/realtime like every other escalation path.
    const publish = jest.spyOn(outboxService, 'publishEvent').mockResolvedValue(undefined as any);

    await processSlaEnforcementJob(55);

    // The WHERE clause now re-asserts the PENDING status read above, so a
    // concurrent legitimate transition (e.g. a host approving right as this
    // runs) can't be silently reverted back to ESCALATED.
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ESCALATED' }),
      expect.objectContaining({ where: { id: 55, status: 'PENDING' } })
    );
    expect(notify).toHaveBeenCalledWith(
      77,
      expect.stringContaining('Escalated'),
      expect.stringContaining('55'),
      'SLA_ESCALATED'
    );
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'VISIT.ESCALATED',
        metadata: expect.objectContaining({ entity_id: 55, office_id: 9 }),
      }),
      undefined,
      expect.objectContaining({ type: 'Visit', id: 55 })
    );
  });
});
