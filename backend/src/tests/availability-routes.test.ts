import { afterEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import { appConfig } from '../config/app.config';
import { AvailabilityService } from '../modules/scheduling/availability.service';
import { AvailabilityRepository } from '../modules/scheduling/availability.repository';
import { Op } from 'sequelize';
import { Office, Department, Host, Service, RecurringAvailability, TimeSlot, Visit, User, GuestProfile } from '../infrastructure/database/models';

const makeToken = (payload: { id: number; roles?: string[]; office_id?: number }) =>
  jwt.sign(payload, appConfig.jwt.secret as string);

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Availability routes', () => {
  it('lists public time slots with mapped query parameters', async () => {
    const context = {
      service: { id: 2, name: 'Onboarding' },
      department_id: 4,
      hosts: [],
      slots: [],
    };

    const spy = jest
      .spyOn(AvailabilityService.prototype, 'getAvailableTimeSlots')
      .mockResolvedValue(context as any);

    const res = await request(app)
      .get('/api/v1/availability/time_slots')
      .query({ office_id: '1', service_id: '2', host_id: '3', date: '2026-03-31' });

    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith({
      officeId: 1,
      serviceId: 2,
      hostId: 3,
      date: '2026-03-31',
    });
    expect(res.body.data.department_id).toBe(4);
  });

  it('routes availability query through department_id when service_id is missing', async () => {
    const context = {
      service: null,
      department_id: 5,
      hosts: [],
      slots: [],
    };

    const spy = jest
      .spyOn(AvailabilityService.prototype, 'getAvailableTimeSlots')
      .mockResolvedValue(context as any);

    const res = await request(app)
      .get('/api/v1/availability/time_slots')
      .query({ office_id: '1', department_id: '5', date: '2026-03-31' });

    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith({
      officeId: 1,
      serviceId: undefined,
      departmentId: 5,
      hostId: undefined,
      date: '2026-03-31',
    });
    expect(res.body.data.department_id).toBe(5);
  });

  it('returns the host availability board for an authenticated host', async () => {
    const token = makeToken({ id: 91, roles: ['host'], office_id: 5 });
    const board = {
      host: { id: 7, user_id: 91, name: 'Support Host 1' },
      range: { start: '2026-03-30T00:00:00.000Z', end: '2026-04-26T23:59:59.999Z' },
      rules: [],
      slots: [],
    };

    const spy = jest
      .spyOn(AvailabilityService.prototype, 'getHostAvailabilityBoard')
      .mockResolvedValue(board as any);

    const res = await request(app)
      .get('/api/v1/availability/host-board')
      .set('Authorization', `Bearer ${token}`)
      .query({ host_id: '7', start_date: '2026-03-30', end_date: '2026-04-05' });

    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith(
      { id: 91, roles: ['host'], office_id: 5 },
      7,
      '2026-03-30',
      '2026-04-05'
    );
    expect(res.body.data.host.name).toBe('Support Host 1');
  });

  it('creates an availability rule for an authenticated host', async () => {
    const token = makeToken({ id: 91, roles: ['host'], office_id: 5 });
    const board = {
      host: { id: 7, user_id: 91, name: 'Support Host 1' },
      range: { start: '2026-03-30T00:00:00.000Z', end: '2026-04-26T23:59:59.999Z' },
      rules: [{ id: 12, recurrence_type: 'WEEKLY', day_of_week: 1 }],
      slots: [],
    };

    const spy = jest
      .spyOn(AvailabilityService.prototype, 'createAvailabilityRule')
      .mockResolvedValue(board as any);

    const res = await request(app)
      .post('/api/v1/availability/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({
        recurrence_type: 'WEEKLY',
        day_of_week: 1,
        start_time: '09:00',
        end_time: '17:00',
        is_available: true,
        label: 'Support coverage',
      });

    expect(res.status).toBe(201);
    expect(spy).toHaveBeenCalledWith(
      { id: 91, roles: ['host'], office_id: 5 },
      expect.objectContaining({
        recurrence_type: 'WEEKLY',
        day_of_week: 1,
        start_time: '09:00',
        end_time: '17:00',
      })
    );
    expect(res.body.data.rules).toHaveLength(1);
  });

  it('coerces numeric availability fields sent as strings before service validation', async () => {
    const token = makeToken({ id: 25, roles: ['super_admin'], office_id: 3 });
    const board = {
      host: { id: 11, user_id: 44, name: 'Scoped Host' },
      range: { start: '2026-03-30T00:00:00.000Z', end: '2026-04-26T23:59:59.999Z' },
      rules: [{ id: 15, recurrence_type: 'WEEKLY', day_of_week: 5 }],
      slots: [],
    };

    const spy = jest
      .spyOn(AvailabilityService.prototype, 'createAvailabilityRule')
      .mockResolvedValue(board as any);

    const res = await request(app)
      .post('/api/v1/availability/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({
        host_id: '11',
        recurrence_type: 'WEEKLY',
        day_of_week: '5',
        start_time: '09:00',
        end_time: '17:00',
        is_available: true,
        horizon_days: '90',
      });

    expect(res.status).toBe(201);
    expect(spy).toHaveBeenCalledWith(
      { id: 25, roles: ['super_admin'], office_id: 3 },
      expect.objectContaining({
        host_id: 11,
        recurrence_type: 'WEEKLY',
        day_of_week: 5,
        horizon_days: 90,
      })
    );
  });

  it('creates a date override rule for an authenticated host without explicit host_id', async () => {
    const token = makeToken({ id: 91, roles: ['host'], office_id: 5 });
    const board = {
      host: { id: 7, user_id: 91, name: 'Support Host 1' },
      range: { start: '2026-03-30T00:00:00.000Z', end: '2026-04-26T23:59:59.999Z' },
      rules: [{ id: 13, recurrence_type: 'DATE_OVERRIDE', specific_date: '2026-04-03' }],
      slots: [],
    };

    const spy = jest
      .spyOn(AvailabilityService.prototype, 'createAvailabilityRule')
      .mockResolvedValue(board as any);

    const res = await request(app)
      .post('/api/v1/availability/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({
        recurrence_type: 'DATE_OVERRIDE',
        specific_date: '2026-04-03',
        start_time: '09:00',
        end_time: '17:00',
        is_available: true,
        label: 'ok',
      });

    expect(res.status).toBe(201);
    expect(spy).toHaveBeenCalledWith(
      { id: 91, roles: ['host'], office_id: 5 },
      expect.objectContaining({
        recurrence_type: 'DATE_OVERRIDE',
        specific_date: '2026-04-03',
        start_time: '09:00',
        end_time: '17:00',
      })
    );
    expect(res.body.data.rules[0].recurrence_type).toBe('DATE_OVERRIDE');
  });

  it('returns in-office and unassigned slots when office_id is provided', async () => {
    const service = new AvailabilityService();

    const serviceRecord = { id: 52, office_id: 1, host_ids: [30] };
    const hostRecord = { id: 30, active: true, user_id: 40, department_id: 5, office_id: 2, user: { full_name: 'Host 30', email: 'host30@example.com' } };
    const slotRecord = {
      id: 100,
      host_id: 30,
      office_id: null,
      availability_rule_id: 999,
      start_time: new Date('2026-04-04T09:00:00.000Z'),
      end_time: new Date('2026-04-04T09:30:00.000Z'),
      is_booked: false,
      slot_state: 'AVAILABLE',
      Host: hostRecord,
    };

    jest.spyOn(Service, 'findByPk').mockResolvedValue(serviceRecord as any);
    jest.spyOn(Host, 'findAll').mockResolvedValue([hostRecord as any]);
    jest.spyOn(TimeSlot, 'findAll').mockResolvedValue([slotRecord as any]);

    const ctx = await service.getAvailableTimeSlots({ officeId: 1, serviceId: 52, date: '2026-04-04', hostId: 30 });

    expect(ctx.slots).toHaveLength(1);
    expect(ctx.slots[0].id).toBe(100);
  });

  it(
    'supports host availability, admin service setup, and guest booking end-to-end',
    async () => {
      const stamp = Date.now();
      let office: Office | null = null;
      let department: Department | null = null;
      let adminUser: User | null = null;
      let guestUser: User | null = null;
      let hostUser: User | null = null;
      let host: Host | null = null;
      let serviceId: number | null = null;
      let ruleId: number | null = null;
      let visitId: number | null = null;

      try {
        office = await Office.create({
          name: `Integration Office ${stamp}`,
          address: '123 Test Lane',
          city: 'Testville',
          country: 'Testland',
          timezone: 'UTC',
          active: true,
          latitude: 40.7128,
          longitude: -74.0060,
        });
        department = await Department.create({
          name: `Integration Department ${stamp}`,
          office_id: office.id,
        });

        adminUser = await User.create({
          full_name: 'Integration Admin',
          email: `admin-integ-${stamp}@example.test`,
        });
        guestUser = await User.create({
          full_name: 'Integration Guest',
          email: `guest-integ-${stamp}@example.test`,
        });
        hostUser = await User.create({
          full_name: 'Integration Host',
          email: `host-integ-${stamp}@example.test`,
        });
        await GuestProfile.create({ user_id: guestUser.id });

        host = await Host.create({
          user_id: hostUser.id,
          department_id: department.id,
          office_id: office.id,
          active: true,
        });

        const hostToken = makeToken({ id: hostUser.id, roles: ['host'], office_id: office.id });
        const adminToken = makeToken({ id: adminUser.id, roles: ['admin'], office_id: office.id });
        const guestToken = makeToken({ id: guestUser.id, roles: ['guest'] });

        const tomorrow = new Date();
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        const selectedDate = tomorrow.toISOString().slice(0, 10);

        const availabilityRes = await request(app)
          .post('/api/v1/availability/rules')
          .set('Authorization', `Bearer ${hostToken}`)
          .send({
            recurrence_type: 'DATE_OVERRIDE',
            specific_date: selectedDate,
            start_time: '09:00',
            end_time: '12:00',
            is_available: true,
            horizon_days: 3,
          });

        expect(availabilityRes.status).toBe(201);
        const rule = availabilityRes.body.data.rules[0];
        expect(rule).toBeTruthy();
        ruleId = Number(rule.id);

        const serviceRes = await request(app)
          .post('/api/v1/services')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: `Integration Service ${stamp}`,
            duration_minutes: 30,
            department_id: Number(department.id),
            office_id: Number(office.id),
            host_ids: [Number(host.id)],
          });

        expect(serviceRes.status).toBe(201);
        serviceId = Number(serviceRes.body.data.id);

        const slotsRes = await request(app)
          .get('/api/v1/availability/time_slots')
          .query({ office_id: office.id, service_id: serviceId, date: selectedDate });

        expect(slotsRes.status).toBe(200);
        expect(Array.isArray(slotsRes.body.data.slots)).toBe(true);
        expect(slotsRes.body.data.slots.length).toBeGreaterThan(0);

        const timeSlotId = slotsRes.body.data.slots[0].id;

        const visitRes = await request(app)
          .post('/api/v1/visits')
          .set('Authorization', `Bearer ${guestToken}`)
          .send({
            office_id: Number(office.id),
            department_id: Number(department.id),
            service_id: serviceId,
            host_id: Number(host.id),
            time_slot_id: Number(timeSlotId),
            purpose: 'Integration booking test',
          });

        expect(visitRes.status).toBe(201);
        expect(visitRes.body.data.status).toBe('PENDING');
        visitId = Number(visitRes.body.data.id);
      } finally {
        // `force: true` on the paranoid models (Visit, Service, Department,
        // User). Without it Sequelize only sets `deleted_at`, the row stays in
        // the table, and the office/department delete below fails on the
        // foreign key — visits.office_id and friends are ON DELETE RESTRICT as
        // of migration 20260904000000, so a soft-deleted visit is still a real
        // referencing row. This teardown used to depend on ON DELETE CASCADE
        // silently removing the visit for it, which is exactly the behaviour
        // that migration exists to stop.
        if (visitId) {
          await Visit.destroy({ where: { id: visitId }, force: true });
        }
        if (ruleId) {
          await TimeSlot.destroy({ where: { availability_rule_id: ruleId } });
          await RecurringAvailability.destroy({ where: { id: ruleId } });
        }
        if (serviceId) {
          await Service.destroy({ where: { id: serviceId }, force: true });
        }
        if (host) {
          await Host.destroy({ where: { id: host.id } });
        }
        if (department) {
          await Department.destroy({ where: { id: department.id }, force: true });
        }
        if (office) {
          await Office.destroy({ where: { id: office.id }, force: true });
        }
        const userIds = [adminUser?.id, guestUser?.id, hostUser?.id].filter(Boolean) as number[];
        if (userIds.length) {
          await GuestProfile.destroy({ where: { user_id: { [Op.in]: userIds } } });
          await User.destroy({ where: { id: { [Op.in]: userIds } }, force: true });
        }
      }
    },
    60000,
  );

  it('matches date override rule on UTC date iteration', () => {
    const service = new AvailabilityService();
    const rule = { recurrence_type: 'DATE_OVERRIDE', specific_date: '2026-04-03' };

    expect((service as any).ruleMatchesDateKey(rule, '2026-04-03')).toBe(true);
    expect((service as any).ruleMatchesDateKey(rule, '2026-04-02')).toBe(false);
    expect((service as any).ruleMatchesDateKey(rule, '2026-04-04')).toBe(false);
  });

  it('rejects date override availability windows that are already over in the office timezone', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-21T09:30:00.000Z'));

    const service = new AvailabilityService();
    jest.spyOn(AvailabilityRepository.prototype, 'findHostByUserId').mockResolvedValue({ id: 7, user_id: 91, office_id: 5 } as any);
    jest.spyOn(AvailabilityRepository.prototype, 'findHostById').mockResolvedValue({ id: 7, office_id: 5 } as any);
    jest.spyOn(Office, 'findByPk').mockResolvedValue({ timezone: 'Africa/Nairobi' } as any);

    await expect(
      service.createAvailabilityRule(
        { id: 91, roles: ['host'], office_id: 5 },
        {
          recurrence_type: 'DATE_OVERRIDE',
          specific_date: '2026-04-21',
          start_time: '09:00',
          end_time: '12:00',
          is_available: true,
        },
      ),
    ).rejects.toThrow('Date override availability must end in the future for the selected office timezone');

    jest.useRealTimers();
  });

  it('skips creating past slots when a same-day availability window is partially elapsed', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-21T09:15:00.000Z'));

    const service = new AvailabilityService();
    jest.spyOn(Office, 'findByPk').mockResolvedValue({ timezone: 'Africa/Nairobi' } as any);
    jest.spyOn(TimeSlot, 'findOne').mockResolvedValue(null);
    const createSpy = jest.spyOn(TimeSlot, 'create').mockResolvedValue({} as any);

    await (service as any).materializeRuleSlots(
      {
        id: 44,
        host_id: 7,
        office_id: 5,
        recurrence_type: 'DATE_OVERRIDE',
        specific_date: '2026-04-21',
        start_time: '12:00',
        end_time: '14:00',
        is_available: true,
      },
      0,
    );

    expect(createSpy).toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        start_time: new Date('2026-04-21T09:00:00.000Z'),
      }),
    );
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        start_time: new Date('2026-04-21T10:00:00.000Z'),
      }),
    );

    jest.useRealTimers();
  });
});
