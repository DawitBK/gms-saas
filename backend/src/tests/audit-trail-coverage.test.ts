import { afterEach, describe, expect, it, jest } from '@jest/globals';
import * as auditService from '../shared/services/audit.service';
import { DepartmentService } from '../modules/departments/department.service';
import { CacheService } from '../infrastructure/cache/cache.service';
import { CreateServiceInteractor } from '../modules/services/use-cases/CreateServiceInteractor';
import { UpdateServiceInteractor } from '../modules/services/use-cases/UpdateServiceInteractor';
import { ArchiveServiceInteractor } from '../modules/services/use-cases/ArchiveServiceInteractor';
import { RestoreServiceInteractor } from '../modules/services/use-cases/RestoreServiceInteractor';
import { AvailabilityService } from '../modules/scheduling/availability.service';
import { AuthController } from '../modules/auth/auth.controller';

/**
 * audit_logs coverage for the admin actions that used to leave no row
 * (GMS browser walk-through 2026-10-13): department archive/restore, service
 * create/update/archive/restore, availability saves, and password change.
 * (User create / role change and the manual check-in exception are covered in
 * user.service.test.ts and checkin.service.test.ts.)
 *
 * logAudit is a deliberate no-op under NODE_ENV=test, so these assert on a
 * spy rather than on the table.
 */
describe('audit trail coverage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const spyAudit = () =>
    jest.spyOn(auditService, 'logAudit').mockResolvedValue(undefined as any);

  it('DepartmentService.deleteDepartment writes DEPARTMENT_ARCHIVE', async () => {
    const logAuditSpy = spyAudit();
    jest.spyOn(CacheService, 'delPattern').mockResolvedValue(undefined as any);
    const service = new DepartmentService();
    (service as any).repository = {
      findById: jest.fn(async () => ({ id: 5, name: 'Finance', office_id: 2 })),
      delete: jest.fn(async () => true),
    };

    await service.deleteDepartment(5, { id: 9, roles: ['super_admin'] });

    expect(logAuditSpy).toHaveBeenCalledWith(
      9,
      'DEPARTMENT_ARCHIVE',
      'Department',
      5,
      { name: 'Finance', office_id: 2 },
      { archived: true },
    );
  });

  it('DepartmentService.restoreDepartment writes DEPARTMENT_RESTORE', async () => {
    const logAuditSpy = spyAudit();
    jest.spyOn(CacheService, 'delPattern').mockResolvedValue(undefined as any);
    const service = new DepartmentService();
    (service as any).repository = {
      findById: jest.fn(async () => ({ id: 5, name: 'Finance', office_id: 2 })),
      restore: jest.fn(async () => true),
    };

    await service.restoreDepartment(5, { id: 9, roles: ['super_admin'] });

    expect(logAuditSpy.mock.calls[0].slice(0, 4)).toEqual([9, 'DEPARTMENT_RESTORE', 'Department', 5]);
  });

  it('a failed department archive writes no row', async () => {
    const logAuditSpy = spyAudit();
    const service = new DepartmentService();
    (service as any).repository = {
      findById: jest.fn(async () => ({ id: 5, name: 'Finance', office_id: 2 })),
      delete: jest.fn(async () => false),
    };

    await expect(service.deleteDepartment(5, { id: 9, roles: ['super_admin'] })).rejects.toThrow();
    expect(logAuditSpy).not.toHaveBeenCalled();
  });

  it('CreateServiceInteractor writes SERVICE_CREATE with the new id', async () => {
    const logAuditSpy = spyAudit();
    const interactor = new CreateServiceInteractor();
    (interactor as any).repository = { create: jest.fn(async (d: any) => ({ id: 42, ...d })) };

    await interactor.execute(
      { name: 'Onboarding', duration_minutes: 30, office_id: 1 },
      { id: 3, roles: ['super_admin'] },
    );

    expect(logAuditSpy).toHaveBeenCalledWith(
      3,
      'SERVICE_CREATE',
      'Service',
      42,
      null,
      expect.objectContaining({ name: 'Onboarding', office_id: 1 }),
    );
  });

  it('Update/Archive/Restore service interactors write SERVICE_UPDATE / SERVICE_ARCHIVE / SERVICE_RESTORE', async () => {
    const logAuditSpy = spyAudit();
    const existing = { id: 8, name: 'Tours', office_id: 1 };
    const actor = { id: 3, roles: ['super_admin'] };

    const update = new UpdateServiceInteractor();
    (update as any).repository = {
      findById: jest.fn(async () => existing),
      update: jest.fn(async () => ({ id: 8 })),
    };
    await update.execute(8, { name: 'Tours 2' }, actor);

    const archive = new ArchiveServiceInteractor();
    (archive as any).repository = {
      findById: jest.fn(async () => existing),
      softDelete: jest.fn(async () => true),
    };
    await archive.execute(8, actor);

    const restore = new RestoreServiceInteractor();
    (restore as any).repository = {
      findById: jest.fn(async () => existing),
      restore: jest.fn(async () => true),
    };
    await restore.execute(8, actor);

    expect(logAuditSpy.mock.calls.map((c) => c[1])).toEqual([
      'SERVICE_UPDATE',
      'SERVICE_ARCHIVE',
      'SERVICE_RESTORE',
    ]);
    expect(logAuditSpy.mock.calls.every((c) => c[0] === 3 && c[2] === 'Service' && c[3] === 8)).toBe(true);
  });

  it('AvailabilityService writes AVAILABILITY_RULE_DELETE and AVAILABILITY_SLOT_DELETE', async () => {
    const logAuditSpy = spyAudit();
    const service = new AvailabilityService();
    const rule = {
      id: 11,
      host_id: 6,
      office_id: 1,
      recurrence_type: 'WEEKLY',
      day_of_week: 2,
      start_time: '09:00:00',
      end_time: '12:00:00',
      is_available: true,
    };
    const slot = {
      id: 21,
      host_id: 6,
      office_id: 1,
      start_time: new Date('2026-11-03T06:00:00Z'),
      end_time: new Date('2026-11-03T06:30:00Z'),
      slot_state: 'AVAILABLE',
      is_booked: false,
    };
    (service as any).repository = {
      findRuleById: jest.fn(async () => rule),
      findHostByUserId: jest.fn(async () => ({ id: 6 })),
      deleteFutureUnbookedSlotsForRule: jest.fn(async () => undefined),
      deleteRule: jest.fn(async () => undefined),
      findSlotById: jest.fn(async () => slot),
      findActiveVisitsForSlot: jest.fn(async () => null),
      deleteSlot: jest.fn(async () => undefined),
    };
    jest.spyOn(service, 'getHostAvailabilityBoard').mockResolvedValue({} as any);
    const actor = { id: 4, roles: ['host'], office_id: 1 };

    await service.deleteAvailabilityRule(actor, 11);
    await service.deleteTimeSlot(actor, 21);

    expect(logAuditSpy.mock.calls.map((c) => [c[1], c[2], c[3]])).toEqual([
      ['AVAILABILITY_RULE_DELETE', 'AvailabilityRule', 11],
      ['AVAILABILITY_SLOT_DELETE', 'TimeSlot', 21],
    ]);
    expect(logAuditSpy.mock.calls[0][4]).toMatchObject({ host_id: 6, recurrence_type: 'WEEKLY' });
  });

  it('AvailabilityService.createAvailabilityRule writes AVAILABILITY_RULE_CREATE', async () => {
    const logAuditSpy = spyAudit();
    const service = new AvailabilityService();
    const createdRule = {
      id: 31,
      host_id: 6,
      office_id: 1,
      recurrence_type: 'WEEKLY',
      day_of_week: 3,
      start_time: '09:00:00',
      end_time: '10:00:00',
      is_available: true,
    };
    (service as any).repository = { createRule: jest.fn(async () => createdRule) };
    jest.spyOn(service as any, 'resolveManagedHostId').mockResolvedValue(6);
    jest.spyOn(service as any, 'validatePatternPayload').mockReturnValue(undefined);
    jest.spyOn(service as any, 'requireHostById').mockResolvedValue({ id: 6, office_id: 1 });
    jest.spyOn(service as any, 'resolveOfficeTimezone').mockResolvedValue('UTC');
    jest.spyOn(service as any, 'validateTimeWindow').mockReturnValue(undefined);
    jest.spyOn(service as any, 'validateRuleEffectiveWindow').mockReturnValue(undefined);
    jest.spyOn(service as any, 'materializeRuleSlots').mockResolvedValue(undefined);
    jest.spyOn(service, 'getHostAvailabilityBoard').mockResolvedValue({} as any);

    await service.createAvailabilityRule(
      { id: 4, roles: ['host'], office_id: 1 },
      { recurrence_type: 'WEEKLY', day_of_week: 3, start_time: '09:00', end_time: '10:00' },
    );

    expect(logAuditSpy).toHaveBeenCalledWith(
      4,
      'AVAILABILITY_RULE_CREATE',
      'AvailabilityRule',
      31,
      null,
      expect.objectContaining({ host_id: 6, recurrence_type: 'WEEKLY', day_of_week: 3 }),
    );
  });

  it('AuthController.changePassword writes PASSWORD_CHANGE without either password', async () => {
    const logAuditSpy = spyAudit();
    const authService = { changePassword: jest.fn(async (..._args: any[]) => undefined) };
    const controller = new AuthController(authService as any);
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };

    await controller.changePassword(
      { user: { id: 15 }, body: { old_password: 'OldSecret#1', new_password: 'NewSecret#2' } } as any,
      res,
    );

    expect(authService.changePassword).toHaveBeenCalledWith(15, 'OldSecret#1', 'NewSecret#2');
    expect(logAuditSpy).toHaveBeenCalledWith(15, 'PASSWORD_CHANGE', 'User', 15, null, { method: 'SELF_SERVICE' });
    expect(JSON.stringify(logAuditSpy.mock.calls)).not.toMatch(/Secret/);
  });

  it('AuthController.changePassword writes no row when the service rejects the old password', async () => {
    const logAuditSpy = spyAudit();
    const authService = {
      changePassword: jest.fn(async () => {
        throw new Error('Current password incorrect');
      }),
    };
    const controller = new AuthController(authService as any);
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };

    await expect(
      controller.changePassword({ user: { id: 15 }, body: { old_password: 'x', new_password: 'y' } } as any, res),
    ).rejects.toThrow();
    expect(logAuditSpy).not.toHaveBeenCalled();
  });
});
