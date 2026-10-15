import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VisitService } from '../modules/visits/visit.service';
import { AppError } from '../core/errors/AppError';
import { ErrorCodes } from '../core/errors/errorCodes';

describe('VisitService status transition orchestration', () => {
  let service: VisitService;
  let transitionMock: any;

  beforeEach(() => {
    service = new VisitService();
    transitionMock = jest.fn() as any;
    (service as any).transitionService = {
      processStatusChange: transitionMock,
    };
  });

  it('forwards status transition requests to transition service', async () => {
    transitionMock.mockResolvedValueOnce({ id: 999, status: 'DECLINED' });

    const actor = { id: 1, roles: ['super_admin'] };
    const result = await service.processStatusChange(999, actor, 'DECLINED');

    expect(result).toMatchObject({ id: 999, status: 'DECLINED' });
    expect(transitionMock).toHaveBeenCalledWith(999, actor, 'DECLINED', undefined);
  });

  it('propagates transition validation errors unchanged', async () => {
    transitionMock.mockRejectedValueOnce(
      new AppError('Visit not found', ErrorCodes.SYSTEM_NOT_FOUND, 404)
    );

    await expect(service.processStatusChange(404, 1, 'APPROVED')).rejects.toMatchObject({
      code: ErrorCodes.SYSTEM_NOT_FOUND,
      statusCode: 404,
    });
  });

  it('supports existing transaction forwarding', async () => {
    const tx = { id: 'tx-1' } as any;
    transitionMock.mockResolvedValueOnce({ id: 1001, status: 'CHECKED_IN' });

    const actor = { id: 1, roles: ['super_admin'] };
    await service.processStatusChange(1001, actor, 'CHECKED_IN', tx);

    expect(transitionMock).toHaveBeenCalledWith(1001, actor, 'CHECKED_IN', tx);
  });
});
