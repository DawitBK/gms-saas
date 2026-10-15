import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VisitService } from '../modules/visits/visit.service';
import { AppError } from '../core/errors/AppError';
import { ErrorCodes } from '../core/errors/errorCodes';

describe('Race Condition: booking orchestration', () => {
  const payload = {
    service_id: 1,
    department_id: 1,
    office_id: 1,
    time_slot_id: 1,
    purpose: 'Test booking',
  };

  let service: VisitService;
  let createVisitMock: any;

  beforeEach(() => {
    service = new VisitService();
    createVisitMock = (jest
      .fn() as any)
      .mockResolvedValueOnce({ id: 999, status: 'PENDING' })
      .mockRejectedValueOnce(
        new AppError(
          'Requested visit time strictly locked or already consumed by another booking',
          ErrorCodes.SLOT_LOCKED,
          409
        )
      );

    (service as any).commandService = {
      createVisit: createVisitMock,
    };
  });

  it('surfaces one success and one SLOT_LOCKED failure under concurrent create requests', async () => {
    const [resultA, resultB] = await Promise.allSettled([
      service.createVisit(1, payload),
      service.createVisit(2, payload),
    ]);

    const fulfilled = [resultA, resultB].filter((result) => result.status === 'fulfilled');
    const rejected = [resultA, resultB].filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const err = (rejected[0] as PromiseRejectedResult).reason as AppError;
    expect(err.code).toBe(ErrorCodes.SLOT_LOCKED);
    expect(err.statusCode).toBe(409);
    expect(createVisitMock).toHaveBeenCalledTimes(2);
  });
});
