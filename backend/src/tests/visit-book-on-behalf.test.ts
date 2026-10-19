import { VisitCommandService } from '../modules/visits/visit.command.service';
import * as transaction from '../core/db/transaction';

/**
 * Who may pass a `guest_id` other than their own to createVisit. Staff (admin,
 * reception, host and the super_* variants) may; a guest may not. A refusal is
 * the 403 guard; "allowed" is proven by getting past the guard to the
 * transaction, which is stubbed to throw a sentinel.
 */
describe('createVisit: booking on behalf of another guest', () => {
  const SENTINEL = new Error('reached-transaction');
  let service: VisitCommandService;

  beforeEach(() => {
    jest.spyOn(transaction, 'withTransaction').mockRejectedValue(SENTINEL);
    service = new VisitCommandService({} as any, {} as any, {} as any);
  });

  afterEach(() => jest.restoreAllMocks());

  const payload = { guest_id: 99, office_id: 1, service_id: 1 };

  it.each(['host', 'super_host', 'reception', 'super_reception', 'admin', 'super_admin'])(
    'lets %s book for an existing guest',
    async (role) => {
      await expect(service.createVisit(5, payload, [role])).rejects.toBe(SENTINEL);
    },
  );

  it('refuses a plain guest booking as someone else', async () => {
    await expect(service.createVisit(5, payload, ['guest'])).rejects.toMatchObject({
      statusCode: 403,
      message: 'You can only book a visit for yourself.',
    });
  });

  it('lets a guest pass their own id', async () => {
    await expect(
      service.createVisit(5, { ...payload, guest_id: 5 }, ['guest']),
    ).rejects.toBe(SENTINEL);
  });
});
