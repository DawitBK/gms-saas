import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { NotificationDomainService } from '../modules/notifications/notification.service';
import { EventTypes } from '../infrastructure/events/eventTypes';
import * as outboxService from '../infrastructure/events/outbox.service';

describe('NotificationDomainService outbox integration', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('writes notification realtime pulses to the outbox instead of emitting in-process only', async () => {
    const service = new NotificationDomainService();

    (service as any).repository = {
      create: jest.fn(async () => ({ id: 81, user_id: 13 })),
      getUserDeliveryProfile: jest.fn(async () => null),
    };
    jest.spyOn(outboxService, 'publishEvent').mockResolvedValue(undefined as any);
    jest.spyOn(outboxService, 'enqueueJob').mockResolvedValue(undefined as any);

    const notification = await service.createNotification(
      13,
      'Arrival update',
      'Your guest has arrived.',
      'VISIT',
      { visitId: 44 }
    );

    expect(notification.id).toBe(81);
    expect(outboxService.publishEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: EventTypes.NOTIFICATION_CREATED,
        metadata: expect.objectContaining({
          entity_id: 13,
          actor_id: 0,
          after: expect.objectContaining({
            title: 'Arrival update',
            message: 'Your guest has arrived.',
            type: 'VISIT',
            metadata: { visitId: 44 },
            id: 81,
          }),
        }),
      }),
      undefined,
      { type: 'Notification', id: 81 }
    );
  });
});
