import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VisitService } from '../modules/visits/visit.service';
import { AppError } from '../core/errors/AppError';
import { ErrorCodes } from '../core/errors/errorCodes';

describe('VisitService booking orchestration', () => {
  let service: VisitService;
  let createVisitMock: any;

  beforeEach(() => {
    service = new VisitService();
    createVisitMock = jest.fn() as any;
    (service as any).commandService = {
      createVisit: createVisitMock,
    };
  });

  it('forwards create booking payload and returns command result', async () => {
    createVisitMock.mockResolvedValueOnce({ id: 55, status: 'PENDING' });

    const result = await service.createVisit(12, {
      office_id: 3,
      department_id: 8,
      service_id: 4,
      time_slot_id: 9,
      host_id: 44,
      purpose: 'Initial consultation',
    });

    expect(result).toMatchObject({ id: 55, status: 'PENDING' });
    // Third argument: the caller's roles, forwarded so the command layer can
    // decide whether a `guest_id` in the body is allowed to differ from the
    // authenticated caller (only admin/reception may book for someone else).
    expect(createVisitMock).toHaveBeenCalledWith(
      12,
      expect.objectContaining({
        office_id: 3,
        department_id: 8,
        service_id: 4,
        time_slot_id: 9,
      }),
      []
    );
  });

  it('supports create booking payloads without service_id', async () => {
    createVisitMock.mockResolvedValueOnce({ id: 56, status: 'PENDING' });

    const result = await service.createVisit(13, {
      office_id: 3,
      department_id: 8,
      time_slot_id: 19,
      host_id: 44,
      purpose: 'Unknown service reception flow',
    });

    expect(result).toMatchObject({ id: 56, status: 'PENDING' });
    expect(createVisitMock).toHaveBeenCalledWith(
      13,
      expect.not.objectContaining({ service_id: expect.anything() }),
      []
    );
  });

  it('propagates slot errors from command layer', async () => {
    createVisitMock.mockRejectedValueOnce(
      new AppError(
        'Selected arrival window has already passed',
        ErrorCodes.INVALID_INPUT,
        400
      )
    );

    await expect(
      service.createVisit(14, {
        office_id: 3,
        department_id: 8,
        time_slot_id: 29,
        host_id: 44,
        purpose: 'Past slot should fail',
      })
    ).rejects.toThrow('Selected arrival window has already passed');
  });
});
