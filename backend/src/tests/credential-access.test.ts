import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CredentialService } from '../modules/credentials/credential.service';

describe('CredentialService access control', () => {
  let service: CredentialService;

  beforeEach(() => {
    service = new CredentialService();
  });

  it('allows a guest to view credentials for their own visit', async () => {
    const mockRepository = {
      findVisitAccessContext: jest.fn<() => Promise<any>>(async () => ({ id: 1, guest_id: 14, office_id: 2 })),
      listByVisitId: jest.fn<() => Promise<any[]>>(async () => [{ id: 9, visit_id: 1, status: 'ACTIVE', metadata: null }]),
    };

    (service as any).credentialRepository = mockRepository;

    const result = await service.listVisitCredentialsForActor(1, { id: 14, roles: ['guest'] });

    expect(mockRepository.listByVisitId as any).toHaveBeenCalledWith(1);
    expect(result).toHaveLength(1);
  });

  it('blocks a guest from viewing credentials for another guest visit', async () => {
    const mockRepository = {
      findVisitAccessContext: jest.fn<() => Promise<any>>(async () => ({ id: 1, guest_id: 14, office_id: 2 })),
      listByVisitId: jest.fn(),
    };

    (service as any).credentialRepository = mockRepository;

    await expect(
      service.listVisitCredentialsForActor(1, { id: 99, roles: ['guest'] })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('blocks office-scoped staff from viewing credentials outside their office', async () => {
    const mockRepository = {
      findVisitAccessContext: jest.fn<() => Promise<any>>(async () => ({ id: 1, guest_id: 14, office_id: 4 })),
      listByVisitId: jest.fn(),
    };

    (service as any).credentialRepository = mockRepository;

    await expect(
      service.listVisitCredentialsForActor(1, { id: 7, roles: ['reception'], office_id: 2 })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
