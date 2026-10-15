import { VisitService } from '../modules/visits/visit.service';

describe('VisitService scope handling', () => {
  let service: VisitService;

  beforeEach(() => {
    service = new VisitService();
  });

  it('rejects reception users that do not have an office assignment', async () => {
    await expect(
      service.buildScopedFilter({ id: 10, roles: ['reception'] }, { status: 'PENDING' })
    ).rejects.toThrow('Reception account is missing an office assignment');
  });

  it('still constrains reception users to their office when office_id is present', async () => {
    const filter = await service.buildScopedFilter(
      { id: 10, roles: ['reception'], office_id: 2 },
      { status: 'PENDING' }
    );

    expect(filter).toEqual({ status: 'PENDING', office_id: 2 });
  });
});
