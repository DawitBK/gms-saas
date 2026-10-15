import { describe, expect, it, jest } from '@jest/globals';
import { OperationsService } from '../modules/operations/operations.service';
import { appConfig } from '../config/app.config';

jest.mock('../infrastructure/events/outbox.repository', () => ({
  listRecentOutboxFailures: jest.fn(async () => []),
  retryOutboxEvent: jest.fn(async () => ({
    id: 11,
    status: 'PENDING',
    available_at: new Date('2026-03-30T12:30:00.000Z'),
  })),
}));

describe('Operations integration health', () => {
  it('returns failure visibility for integrations and retry delegates', async () => {
    const service = new OperationsService();

    (service as any).repository = {
      countFailedOutbox: jest.fn(async () => 2),
      countFailedWebhookEvents: jest.fn(async () => 1),
      countFailedCredentials: jest.fn(async () => 3),
      countApprovedWithFailedCredentialLatest: jest.fn(async () => 1),
      countUnifiReconciliationPending: jest.fn(async () => 0),
      getUnifiReconciliationPending: jest.fn(async () => []),
      getFailedOutbox: jest.fn(async () => [
        {
          id: 11,
          channel: 'QUEUE_JOB',
          aggregate_type: 'Visit',
          aggregate_id: '44',
          event_type: 'MESSAGE.SENT',
          queue_name: 'EMAILS',
          job_name: 'VisitApprovedEmail',
          attempt_count: 2,
          max_attempts: 10,
          available_at: new Date('2026-03-30T12:00:00.000Z'),
          error_message: 'smtp timeout',
          updated_at: new Date('2026-03-30T12:10:00.000Z'),
        },
      ]),
      getFailedWebhookEvents: jest.fn(async () => [
        {
          id: 21,
          source: 'UNIFI_ACCESS',
          event_id: 'evt-1',
          event_type: 'access.granted',
          error_message: 'visit missing',
          updated_at: new Date('2026-03-30T12:15:00.000Z'),
        },
      ]),
      getFailedCredentials: jest.fn(async () => [
        {
          id: 31,
          visit_id: 91,
          provider: 'UNIFI_ACCESS',
          status: 'FAILED',
          metadata: { failure_reason: 'provider unavailable' },
          updated_at: new Date('2026-03-30T12:20:00.000Z'),
        },
      ]),
      getApprovedWithFailedCredentialLatest: jest.fn(async () => [
        {
          visit_id: 91,
          reference_number: 'REF-00091',
          office_id: 1,
          guest_id: 501,
          visit_updated_at: new Date('2026-03-30T12:22:00.000Z'),
          credential_id: 31,
          credential_provider: 'UNIFI_ACCESS',
          credential_updated_at: new Date('2026-03-30T12:20:00.000Z'),
          credential_metadata: { failure_reason: 'provider unavailable' },
        },
      ]),
    };

    (service as any).unifiWebhookService = {
      replayStoredEvent: jest.fn(async () => ({
        id: 21,
        status: 'PROCESSED',
        event_id: 'evt-1',
        message: 'Access grant processed.',
      })),
    };

    const health = await service.getIntegrationHealth({ roles: ['super_admin'] });
    const retried = await service.retryOutboxEvent(11);
    const replayed = await service.replayUnifiWebhook(21);

    expect(health.failures).toEqual({
      outbox: 2,
      webhook_events: 1,
      credentials: 3,
      approved_with_failed_credentials: 1,
      unifi_reconciliation_pending: 0,
    });
    expect(health.failed_outbox[0].job_name).toBe('VisitApprovedEmail');
    expect(health.failed_webhooks[0].event_id).toBe('evt-1');
    expect(health.failed_credentials[0].failure_reason).toBe('provider unavailable');
    expect(health.approved_with_failed_credentials[0].visit_id).toBe(91);
    expect(retried.status).toBe('PENDING');
    expect(replayed.status).toBe('PROCESSED');
  });

  it('normalizes report insights to the frontend contract', async () => {
    const service = new OperationsService();

    (service as any).repository = {
      getReportData: jest.fn(async () => [
        {
          id: 1,
          status: 'APPROVED',
          purpose: 'Board meeting',
          rating: 5,
          rating_comment: 'Excellent',
          scheduled_start: '2026-03-30T09:00:00.000Z',
          scheduled_end: '2026-03-30T10:00:00.000Z',
          checked_in_at: '2026-03-30T09:00:00.000Z',
          updated_at: '2026-03-30T10:05:00.000Z',
          created_at: '2026-03-30T08:30:00.000Z',
          is_vip: true,
          guest: {
            id: 101,
            full_name: 'Guest One',
            email: 'guest1@example.com',
            phone: '+1555911000001',
            guestProfile: { company: 'Acme Plc' },
          },
          assignedHost: {
            id: 201,
            user_id: 301,
            user: { full_name: 'Host One', email: 'host1@example.com' },
          },
          service: { id: 11, name: 'Advisory' },
          department: { name: 'Operations' },
          office: { name: 'HQ' },
          credentials: [],
          approvals: [],
          assignments: [],
        },
        {
          id: 2,
          status: 'CHECKED_IN',
          purpose: 'Board meeting',
          rating: 3,
          rating_comment: null,
          scheduled_start: '2026-03-30T11:00:00.000Z',
          scheduled_end: '2026-03-30T12:00:00.000Z',
          checked_in_at: '2026-03-30T11:15:00.000Z',
          updated_at: '2026-03-30T11:20:00.000Z',
          created_at: '2026-03-30T10:30:00.000Z',
          is_vip: false,
          guest: {
            id: 102,
            full_name: 'Guest Two',
            email: 'guest2@example.com',
            phone: '+1555911000002',
            guestProfile: { company: 'Acme Plc' },
          },
          assignedHost: {
            id: 202,
            user_id: 302,
            user: { full_name: 'Host Two', email: 'host2@example.com' },
          },
          service: { id: 12, name: 'Support' },
          department: { name: 'Operations' },
          office: { name: 'HQ' },
          credentials: [],
          approvals: [],
          assignments: [],
        },
      ]),
      getStatusDistribution: jest.fn(async () => []),
      getDailyTrend: jest.fn(async () => []),
      getHourlyTrend: jest.fn(async () => []),
      getServiceDistribution: jest.fn(async () => []),
    };

    const report = await service.getReports(
      { id: 1, roles: ['super_admin'] },
      {},
    );

    expect(report.organization_insights).toEqual([
      { company: 'Acme Plc', count: 2, percent: 100 },
    ]);
    expect(report.purpose_insights).toEqual([
      { purpose: 'Board meeting', count: 2, percent: 100 },
    ]);
    expect(report.guest_type_insights).toEqual([
      { type: 'VIP', count: 1, percent: 50 },
      { type: 'Standard', count: 1, percent: 50 },
    ]);
    expect(report.rating_insights).toEqual({
      average_rating: 4,
      total_reviews: 2,
      recent_feedback: [
        {
          guest_id: 101,
          host_name: 'Host One',
          rating: 5,
          comment: 'Excellent',
          created_at: '2026-03-30T10:05:00.000Z',
        },
      ],
    });
    expect(report.punctuality_insights).toEqual({
      on_time_percentage: 50,
      avg_delay_minutes: 8,
    });
  });
});

describe('Operations seed workflow', () => {
  it('refuses in production (and so on the mirror), where seeding would overwrite live data', async () => {
    const was = appConfig.isProduction;
    (appConfig as { isProduction: boolean }).isProduction = true;
    try {
      await expect(new OperationsService().seedSystem()).rejects.toMatchObject({ statusCode: 403, message: 'System seeding is not available in production.' });
    } finally {
      (appConfig as { isProduction: boolean }).isProduction = was;
    }
  });
});
