import { appConfig } from "../../config/app.config";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { spawn } from "child_process";
import { redisClient } from "../../infrastructure/cache/redis.client";
import { queues } from "../../infrastructure/queue/queue";
import { CacheKeys, CacheService, CACHE_TTL } from "../../infrastructure/cache/cache.service";
import { AppError } from "../../core/errors/AppError";
import { ErrorCodes } from "../../core/errors/errorCodes";
import { logger } from "../../core/logger/logger";
import { UniFiWebhookService } from "../unifi-webhooks/unifi-webhook.service";
import {
  OperationsDashboardDTO,
  OperationsIntegrationHealthDTO,
  OperationsReportDTO,
} from "./operations.dto";
import { OperationsRepository } from "./operations.repository";
import { AuthRepository } from "../auth/auth.repository";
import {
  listRecentOutboxFailures,
  retryOutboxEvent,
} from "../../infrastructure/events/outbox.repository";
import {
  hasGlobalOfficeScope,
  userHasAllowedRole,
  ROLE_NAMES,
} from "../../shared/auth/roles";
import { requireActorOfficeId } from "../../shared/auth/scope-resolver";
import {
  calculateVisitPerformanceMetrics,
  calculateDepartmentPerformance,
} from "../hosts/host-metrics";
import {
  APPROVAL_DECISION_APPROVED,
  CREDENTIAL_STATUS_ACTIVE,
  CREDENTIAL_STATUS_FAILED,
  OUTBOX_STATUS_PENDING,
  VISIT_STATUS_CANCELLED,
  VISIT_STATUS_CHECKED_IN,
  VISIT_STATUS_DECLINED,
} from "../../core/status/status-catalog";
import {
  Visit,
  Host,
  User,
  Role,
  UserRole,
  HostProfile,
  Office,
  Department,
  Service,
  ServiceHost,
  sequelize,
} from "../../infrastructure/database/models";
import bcrypt from "bcryptjs";
import * as XLSX from "xlsx";
import { hashUnusablePassword } from "../../shared/auth/provisioning";
import { assertSeatAvailable } from "../license/license.seats";
import { revokeUserSessions } from "../../shared/services/session-revocation.service";

/**
 * OperationsService
 * 
 * Central hub for administrative and cross-cutting operational tasks.
 * Key functionalities:
 * - Real-time Dashboard Analytics (Stat cards, peak hours, throughput).
 * - Reporting & Exports (Filtered visit logs, Excel/PDF generation).
 * - Bulk Data Provisioning (Excel-based organizational import).
 * - System Health Monitoring (Integration status for Redis, UniFi, Sentry).
 * - Outbox Recovery & Audit Logging.
 */
export class OperationsService {
  private repository: OperationsRepository;
  private unifiWebhookService: UniFiWebhookService;
  private authRepository: AuthRepository;

  constructor() {
    this.repository = new OperationsRepository();
    this.unifiWebhookService = new UniFiWebhookService();
    this.authRepository = new AuthRepository();
  }

  private getBackendRoot() {
    return path.resolve(__dirname, "../../..");
  }

  private getSeedRunDirectory() {
    const seedRunDir = path.join(this.getBackendRoot(), "scratch", "seed-runs");
    mkdirSync(seedRunDir, { recursive: true });
    return seedRunDir;
  }

  private getSeedRunPaths(runId: string) {
    const seedRunDir = this.getSeedRunDirectory();
    return {
      statusFile: path.join(seedRunDir, `${runId}.status.json`),
      outputFile: path.join(seedRunDir, `${runId}.log`),
    };
  }

  public async getBulkTemplate(): Promise<Buffer> {

    // Fetch real data from database
    const [dbOffices, dbDepts, dbServices, dbUsers] = await Promise.all([
      Office.findAll({ order: [['name', 'ASC']] }),
      Department.findAll({ 
        include: [{ model: Office }], 
        order: [['name', 'ASC']] 
      }),
      Service.findAll({ 
        include: [
          { model: Department }, 
          { model: Office },     
          { model: Host, as: 'hosts', include: [{ model: User, as: 'user' }] }
        ],
        order: [['name', 'ASC']] 
      }),
      // FIX: this used to hydrate the full User model plus three levels of
      // fully-hydrated associations (Role/Office/Host->Office/Department/
      // Service) for every user company-wide, with no limit — an unbounded,
      // heavyweight query on every template download. The template only
      // ever reads full_name/email/status off the user, name off
      // Role/Office/Department/Service, and active off Host (see hostRows
      // below) — so narrow every level to just those columns via
      // `attributes` instead of hydrating whole rows. This keeps the
      // single-query "give me everyone" shape the feature legitimately
      // needs, it just stops over-fetching.
      User.findAll({
        attributes: ['id', 'full_name', 'email', 'status'],
        include: [
          { model: Role, as: 'roles', attributes: ['name'] },
          { model: Office, as: 'office', attributes: ['name'] },
          {
            model: Host,
            as: 'host',
            attributes: ['id', 'active'],
            include: [
              { model: Office, as: 'office', attributes: ['name'] },
              { model: Department, as: 'department', attributes: ['name'] },
              { model: Service, as: 'services', attributes: ['name'], through: { attributes: [] } }
            ]
          }
        ],
        order: [['full_name', 'ASC']]
      })
    ]);

    const normalize = (s: string) => s.toString().toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. Collect all unique entities from DB and Legacy users to ensure sync
    const officesMap = new Map<string, any>();
    const deptsMap = new Map<string, any>(); // key: "office:dept"
    const servicesMap = new Map<string, any>(); // key: "dept:service"

    // Seed maps with existing DB data
    dbOffices.forEach(o => officesMap.set(normalize(o.name), { name: o.name, address: o.address, city: o.city, country: o.country }));
    
    // FORCE-INCLUDE UniFi Floors
    const h6 = "Head Office 6th Floor";
    const h7 = "Head Office 7th Floor";
    if (!officesMap.has(normalize(h6))) officesMap.set(normalize(h6), { name: h6, address: "KP HQ", city: "Example City", country: "Exampleland" });
    if (!officesMap.has(normalize(h7))) officesMap.set(normalize(h7), { name: h7, address: "KP HQ", city: "Example City", country: "Exampleland" });

    dbDepts.forEach(d => {
      const oName = (d as any).Office?.name || h6;
      deptsMap.set(`${normalize(oName)}:${normalize(d.name)}`, { name: d.name, office: oName });
    });
    dbServices.forEach(s => {
      const dName = (s as any).Department?.name || "Operations";
      const oName = (s as any).Office?.name || "Head Office 6th Floor";
      servicesMap.set(`${normalize(dName)}:${normalize(s.name)}`, { name: s.name, dept: dName, office: oName, duration: s.duration_minutes });
    });

    // Ensure both floors have default Departments and Services
    [h6, h7].forEach(oName => {
      const dName = "Operations";
      if (!deptsMap.has(`${normalize(oName)}:${normalize(dName)}`)) {
        deptsMap.set(`${normalize(oName)}:${normalize(dName)}`, { name: dName, office: oName });
      }
      const sName = "General Visit";
      if (!servicesMap.has(`${normalize(dName)}:${normalize(sName)}`)) {
        servicesMap.set(`${normalize(dName)}:${normalize(sName)}`, { name: sName, dept: dName, office: oName, duration: 30 });
      }
    });

    const wb = XLSX.utils.book_new();

    // 1. Instructions
    const instructions = [
      ["GMS Enterprise — Organizational Setup Template", "", ""],
      ["", "", ""],
      ["IMPORT ORDER", "You MUST fill sheets in this order:", ""],
      ["Step 1", "Offices", "Create all office locations first"],
      ["Step 2", "Departments", "Link departments to offices by name"],
      ["Step 3", "Services", "Link services to departments and offices"],
      ["Step 4", "Hosts", "Create/update staff accounts and assign roles"],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instructions), "Instructions");

    // 2. Offices (Synchronized Mirror)
    const officeRows = Array.from(officesMap.values()).map(o => ({
      Name: o.name,
      Address: o.address || "KP HQ",
      City: o.city || "Example City",
      Country: o.country || "Exampleland",
      Latitude: o.latitude || 9.03,
      Longitude: o.longitude || 38.74
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(officeRows), "Offices");

    // 3. Departments (Synchronized Mirror)
    const deptRows = Array.from(deptsMap.values()).map(d => ({
      Name: d.name,
      "Office Name": d.office
    }));
    if (deptRows.length === 0) deptRows.push({ Name: "Operations", "Office Name": h6 });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(deptRows), "Departments");

    // 4. Services (Synchronized Mirror with Assigned Hosts)
    const serviceRows = Array.from(servicesMap.values()).map(s => {
      // Find hosts assigned to this service in the DB
      const dbSvc = dbServices.find(ds => normalize(ds.name) === normalize(s.name) && normalize((ds as any).Department?.name || "") === normalize(s.dept));
      const assignedEmails = dbSvc ? ((dbSvc as any).hosts || []).map((h: any) => h.user?.email).filter(Boolean).join(", ") : "";
      
      return {
        Name: s.name,
        "Duration (Mins)": s.duration || 30,
        "Department Name": s.dept,
        "Office Name": s.office,
        "Assigned Hosts": assignedEmails
      };
    });
    if (serviceRows.length === 0) serviceRows.push({ Name: "General Visit", "Duration (Mins)": 30, "Department Name": "Operations", "Office Name": h6, "Assigned Hosts": "" });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(serviceRows), "Services");

    // 5. Hosts (Full system export + Legacy Users)
    const hostRows = dbUsers.map(u => {
      const host = (u as any).host;
      const roles = (u as any).roles || [];
      const oName = (u as any).office?.name || (host as any)?.office?.name || h6;
      const dName = (host?.department?.name) || "Operations";
      
      return {
        "Full Name": u.full_name || "Unknown",
        "Email": u.email,
        "Office Name": normalize(oName) === 'headoffice' ? h6 : oName,
        "Department Name": dName,
        "Assigned Services": (host?.services || []).length > 0 
           ? (host?.services || []).map((s: any) => s.name).join(", ")
           : "General Visit",
        "Roles": roles.map((r: any) => r.name).join(", "),
        "Active": (host ? host.active : u.status === 'ACTIVE') ? "TRUE" : "FALSE"
      };
    });

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hostRows), "Hosts");

    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  }

  public async getDashboard(actor: {
    id?: number;
    roles?: string[];
    office_id?: number;
  }): Promise<OperationsDashboardDTO> {
    const officeId = hasGlobalOfficeScope(actor.roles ?? [])
      ? undefined
      : this.requireOfficeScope(actor);

    // Detect 'Simulated Now' for accurate metrics when running high-fidelity tests
    const latestVisit = await Visit.findOne({ order: [['created_at', 'DESC']] });
    const now = (latestVisit && latestVisit.created_at > new Date()) 
      ? new Date(latestVisit.created_at) 
      : new Date();

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    // For status distribution, look at last 30 days to provide meaningful insight
    const distributionStart = new Date(now);
    distributionStart.setDate(distributionStart.getDate() - 30);
    distributionStart.setHours(0, 0, 0, 0);

    const expiringWindow = new Date(now.getTime() + 4 * 60 * 60 * 1000);

    const [
      dashboardStats,
      activity,
      queue,
      statusDistribution,
      dailyTrend,
    ] = await Promise.all([
      CacheService.remember(
        CacheKeys.dashboardStats(officeId),
        CACHE_TTL.DASHBOARD,
        () => this.repository.getDashboardStats(officeId, startOfDay, endOfDay, now, expiringWindow),
      ),
      this.repository.getRecentActivityRaw(officeId, 25),
      this.repository.getQueue(officeId, 25, startOfDay, now),
      this.repository.getStatusDistribution(
        officeId,
        distributionStart,
        endOfDay,
      ),
      this.repository.getDailyTrend(officeId, 7, undefined, undefined, now),
    ]);

    return {
      generated_at: new Date().toISOString(),
      summary: {
        total_guests: dashboardStats.totalGuests,
        vip_guests: dashboardStats.vipGuests,
        active_guests: dashboardStats.activeGuests,
        pending_approvals: dashboardStats.pendingApprovals,
        entries_today: dashboardStats.entriesToday,
        active_credentials: dashboardStats.activeCredentials,
        declined_total: dashboardStats.declinedTotal,
        expired_total: dashboardStats.expiredTotal,
        total_visits: dashboardStats.totalVisits,
        frequent_guests: dashboardStats.frequentGuests,
        active_visitors: dashboardStats.activeVisitors,
      },
      alerts: [
        {
          key: "pending-overdue",
          severity: dashboardStats.overduePending > 0 ? "critical" : "info",
          label: "Pending visits past arrival time",
          count: dashboardStats.overduePending,
          description:
            "Guests are scheduled to arrive, but their requests are still pending a decision.",
        },
        {
          key: "credentials-expiring",
          severity: dashboardStats.expiringSoon > 0 ? "warning" : "info",
          label: "Credentials expiring soon",
          count: dashboardStats.expiringSoon,
          description:
            "Access credentials due to expire within the next four hours.",
        },
        {
          key: "declined-today",
          severity: dashboardStats.declinedToday > 0 ? "warning" : "info",
          label: "Declined visits today",
          count: dashboardStats.declinedToday,
          description: "Requests declined during the current business day.",
        },
      ],
      activity: this.formatRecentActivity(activity, 12),
      queue: queue.map((visit: any) => {
        const latestCredential = Array.isArray(visit.credentials)
          ? ([...visit.credentials].sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime(),
            )[0] ?? null)
          : null;

        return {
          id: visit.id,
          reference_number: visit.reference_number ?? null,
          guest_name: visit.guest?.full_name ?? "Guest pending profile",
          guest_email: visit.guest?.email ?? "",
          company: visit.guest?.guestProfile?.company ?? null,
          status: visit.status,
          service_name: visit.service?.name ?? null,
          department_name: visit.department?.name ?? null,
          assigned_host_name:
            visit.assignedHost?.user?.full_name ??
            visit.TimeSlot?.Host?.user?.full_name ??
            null,
          assigned_host_email:
            visit.assignedHost?.user?.email ??
            visit.TimeSlot?.Host?.user?.email ??
            null,
          escalated_to_reception: Boolean(visit.escalated_to_reception),
          escalation_reason: visit.escalation_reason ?? null,
          escalated_at: visit.escalated_at ?? null,
          escalated_by_name: visit.escalatedBy?.full_name ?? null,
          approval_status: visit.approvals?.[0]?.status ?? null,
          credential_status: latestCredential?.status ?? null,
          credential_provider: latestCredential?.provider ?? null,
          credential_qr_code: latestCredential?.metadata?.qr_code ?? null,
          credential_pin_code: latestCredential?.metadata?.pin_code ?? null,
          scheduled_start: new Date(visit.scheduled_start).toISOString(),
          scheduled_end: new Date(visit.scheduled_end).toISOString(),
          assignment_history: Array.isArray(visit.assignments)
            ? visit.assignments.map((a: any) => ({
                id: a.id,
                host_name: a.host?.user?.full_name ?? null,
                assigned_by_name: a.assignedBy?.full_name ?? null,
                assigned_at: a.assigned_at,
                reason: a.assignment_reason,
                is_current: a.is_current,
              }))
            : [],
        };
      }),
      status_distribution: statusDistribution,
      daily_trend: dailyTrend,
    };
  }

  public async getIntegrationHealth(actor: {
    roles?: string[];
    office_id?: number;
  }): Promise<OperationsIntegrationHealthDTO> {
    const officeId = hasGlobalOfficeScope(actor.roles ?? [])
      ? undefined
      : this.requireOfficeScope(actor);
    const [
      failedOutbox,
      failedWebhooks,
      failedCredentials,
      approvedWithFailedCredentials,
      unifiReconciliationPending,
      outboxRows,
      webhookRows,
      credentialRows,
      approvedWithFailedCredentialRows,
      unifiReconciliationRows,
      queueRows,
    ] = await Promise.all([
      this.repository.countFailedOutbox(),
      this.repository.countFailedWebhookEvents(),
      this.repository.countFailedCredentials(officeId),
      this.repository.countApprovedWithFailedCredentialLatest(officeId),
      this.repository.countUnifiReconciliationPending(officeId),
      this.repository.getFailedOutbox(10),
      this.repository.getFailedWebhookEvents(10),
      this.repository.getFailedCredentials(officeId, 10),
      this.repository.getApprovedWithFailedCredentialLatest(officeId, 10),
      this.repository.getUnifiReconciliationPending(officeId, 10),
      Promise.all(
        Object.entries(queues).map(async ([queueName, queue]) => {
          const counts = await queue.getJobCounts(
            "waiting",
            "active",
            "failed",
            "delayed",
          );
          return {
            queue: queueName,
            waiting: counts.waiting ?? 0,
            active: counts.active ?? 0,
            failed: counts.failed ?? 0,
            delayed: counts.delayed ?? 0,
          };
        }),
      ),
    ]);

    return {
      generated_at: new Date().toISOString(),
      providers: {
        redis: {
          configured: Boolean(redisClient),
          queue_count: Object.keys(queues).length,
        },
        email: {
          configured: Boolean(appConfig.sendgrid.apiKey || appConfig.smtp.host),
          provider: this.resolveConfiguredEmailProvider(),
        },
        sms: {
          configured: Boolean(
            appConfig.sms.apiKey || appConfig.sms.africasTalking.apiKey,
          ),
          provider:
            appConfig.sms.provider ||
            (appConfig.sms.africasTalking.apiKey ? "africas_talking" : "none"),
        },
        unifi_access: {
          configured: Boolean(
            appConfig.unifiAccess.baseUrl && appConfig.unifiAccess.apiKey,
          ),
          has_webhook_secret: Boolean(appConfig.unifiAccess.webhookSecret),
        },
      },
      failures: {
        outbox: failedOutbox,
        webhook_events: failedWebhooks,
        credentials: failedCredentials,
        approved_with_failed_credentials: approvedWithFailedCredentials,
        unifi_reconciliation_pending: unifiReconciliationPending,
      },
      queues: queueRows,
      failed_outbox: outboxRows.map((row: any) => ({
        id: row.id,
        channel: row.channel,
        status: row.status,
        aggregate_type: row.aggregate_type ?? null,
        aggregate_id: row.aggregate_id ?? null,
        event_type: row.event_type ?? null,
        queue_name: row.queue_name ?? null,
        job_name: row.job_name ?? null,
        attempt_count: row.attempt_count,
        max_attempts: row.max_attempts,
        available_at: row.available_at.toISOString(),
        error_message: row.error_message ?? null,
        updated_at: row.updated_at.toISOString(),
      })),
      failed_webhooks: webhookRows.map((row: any) => ({
        id: row.id,
        source: row.source,
        event_id: row.event_id,
        event_type: row.event_type,
        error_message: row.error_message ?? null,
        updated_at: row.updated_at.toISOString(),
      })),
      failed_credentials: credentialRows.map((row: any) => ({
        id: row.id,
        visit_id: row.visit_id,
        provider: row.provider,
        status: row.status,
        failure_reason: row.metadata?.failure_reason ?? null,
        updated_at: row.updated_at.toISOString(),
      })),
      approved_with_failed_credentials: approvedWithFailedCredentialRows.map(
        (row: any) => ({
          visit_id: Number(row.visit_id),
          reference_number: row.reference_number ?? null,
          office_id: Number(row.office_id),
          guest_id: Number(row.guest_id),
          visit_updated_at: new Date(row.visit_updated_at).toISOString(),
          credential_id: Number(row.credential_id),
          credential_provider: row.credential_provider ?? null,
          credential_updated_at: new Date(
            row.credential_updated_at,
          ).toISOString(),
          failure_reason: row.credential_metadata?.failure_reason ?? null,
        }),
      ),
      unifi_reconciliation_pending: unifiReconciliationRows.map((row: any) => ({
        id: row.id,
        visit_id: row.visit_id,
        provisioned_at: row.provisioned_at
          ? new Date(row.provisioned_at).toISOString()
          : null,
        fallback_reason: row.metadata?.fallback_reason ?? null,
        updated_at: row.updated_at.toISOString(),
      })),
    };
  }

  public async retryOutboxEvent(id: number) {
    const failures = await listRecentOutboxFailures(50);
    const row = await retryOutboxEvent(id);
    return {
      id,
      status: row?.status ?? OUTBOX_STATUS_PENDING,
      available_at:
        row?.available_at?.toISOString?.() ?? new Date().toISOString(),
    };
  }

  public async replayUnifiWebhook(id: number) {
    return this.unifiWebhookService.replayStoredEvent(id);
  }

  /**
   * Read-only surface over the audit trail every module already writes via
   * logAudit() (see shared/services/audit.service.ts). Admin-only: the trail
   * spans every office, so it is not office-scoped like the dashboard/reports.
   */
  public async getAuditLogs(filters: {
    entity?: string;
    action?: string;
    userId?: number;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit =
      filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 25;

    const { rows, count } = await this.repository.getAuditLogs(
      {
        entity: filters.entity,
        action: filters.action,
        userId: filters.userId,
        from: filters.from ? new Date(filters.from) : undefined,
        to: filters.to ? new Date(filters.to) : undefined,
      },
      page,
      limit,
    );

    return {
      logs: rows.map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        user_name: row.user?.full_name ?? null,
        user_email: row.user?.email ?? null,
        request_id: row.request_id,
        action: row.action,
        entity: row.entity,
        entity_id: row.entity_id,
        metadata: row.metadata ?? null,
        created_at: row.created_at.toISOString(),
      })),
      meta: {
        total: count,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(count / limit)),
      },
    };
  }

  public async getReports(
    actor: { id?: number; roles?: string[]; office_id?: number },
    filters: {
      startDate?: string;
      endDate?: string;
      officeId?: number;
      departmentId?: number;
      hostId?: number;
      guestId?: number;
      status?: string;
    },
  ): Promise<OperationsReportDTO> {
    const scopedFilters = {
      ...filters,
      officeId: filters.officeId ? Number(filters.officeId) : undefined,
      departmentId: filters.departmentId
        ? Number(filters.departmentId)
        : undefined,
      hostId: filters.hostId ? Number(filters.hostId) : undefined,
      guestId: filters.guestId ? Number(filters.guestId) : undefined,
    };

    if (!hasGlobalOfficeScope(actor.roles ?? [])) {
      const officeId = this.requireOfficeScope(actor);
      if (
        scopedFilters.officeId &&
        Number(scopedFilters.officeId) !== Number(officeId)
      ) {
        throw new AppError(
          "Report access is outside your office scope",
          ErrorCodes.AUTH_FORBIDDEN,
          403,
        );
      }
      scopedFilters.officeId = Number(officeId);

      // Restriction: Hosts can only see their own reports
      if (
        userHasAllowedRole(actor.roles ?? [], [ROLE_NAMES.host]) &&
        !userHasAllowedRole(actor.roles ?? [], [
          ROLE_NAMES.reception,
          ROLE_NAMES.admin,
        ])
      ) {
        const hostRecord = await Host.findOne({ where: { user_id: actor.id } });
        if (hostRecord) {
          scopedFilters.hostId = hostRecord.id;
        } else {
          // If they have host role but no host record, they shouldn't see anything or it's an error
          scopedFilters.hostId = -1; // Force empty result
        }
      }
    }

    const now = new Date();
    const defaultStart = new Date();
    defaultStart.setDate(now.getDate() - 30);

    const start =
      scopedFilters.startDate &&
      !isNaN(new Date(scopedFilters.startDate).getTime())
        ? new Date(scopedFilters.startDate)
        : defaultStart;
    start.setHours(0, 0, 0, 0);

    const end =
      scopedFilters.endDate && !isNaN(new Date(scopedFilters.endDate).getTime())
        ? new Date(scopedFilters.endDate)
        : now;
    end.setHours(23, 59, 59, 999);

    const [
      data,
      statusDistribution,
      dailyTrend,
      hourlyTrend,
      serviceDistribution,
    ] = await Promise.all([
      this.repository.getReportData({
        ...scopedFilters,
        startDate: start,
        endDate: end,
      }),
      this.repository.getStatusDistribution(
        scopedFilters.officeId,
        start,
        end,
        scopedFilters.hostId,
        scopedFilters.departmentId,
        scopedFilters.guestId,
      ),
      this.repository.getDailyTrend(
        scopedFilters.officeId,
        { startDate: start, endDate: end },
        scopedFilters.hostId,
        scopedFilters.departmentId,
        undefined,
        scopedFilters.guestId,
      ),
      this.repository.getHourlyTrend(
        scopedFilters.officeId,
        start,
        end,
        scopedFilters.hostId,
        scopedFilters.departmentId,
        scopedFilters.guestId,
      ),
      this.repository.getServiceDistribution(
        scopedFilters.officeId,
        start,
        end,
        scopedFilters.hostId,
        scopedFilters.departmentId,
        scopedFilters.guestId,
      ),
    ]);

    const reportRows = data as any[];
    const metrics = calculateVisitPerformanceMetrics(reportRows);
    const departmentPerformance = calculateDepartmentPerformance(reportRows);

    return {
      metrics: {
        total_visits: metrics.total_visits,
        approval_rate: metrics.approval_rate,
        cancellation_rate: metrics.cancellation_rate,
        declined_rate: metrics.declined_rate,
      },
      status_distribution: statusDistribution,
      daily_trend: dailyTrend,
      hourly_trend: hourlyTrend,
      service_distribution: serviceDistribution,
      department_performance: departmentPerformance,
      organization_insights: this.buildReportBreakdown(
        reportRows,
        (row) => row.guest?.guestProfile?.company ?? null,
        (company, count, percent) => ({
          company,
          count,
          percent,
        }),
      ),
      purpose_insights: this.buildReportBreakdown(
        reportRows,
        (row) => {
          const purpose = String(row.purpose ?? "").trim();
          return purpose || null;
        },
        (purpose, count, percent) => ({
          purpose,
          count,
          percent,
        }),
      ),
      rating_insights: this.buildRatingInsights(reportRows),
      punctuality_insights: this.buildPunctualityInsights(reportRows),
      guest_type_insights: this.buildReportBreakdown(
        reportRows,
        (row) => (row.is_vip ? "VIP" : "Standard"),
        (type, count, percent) => ({
          type,
          count,
          percent,
        }),
      ),
      visits: reportRows.map((v) => {
        const latestCredential = Array.isArray((v as any).credentials)
          ? ([...(v as any).credentials].sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime(),
            )[0] ?? null)
          : null;
        const latestApproval = Array.isArray((v as any).approvals)
          ? ([...(v as any).approvals].sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime(),
            )[0] ?? null)
          : null;

        return {
          id: v.id,
          guest_id: (v as any).guest?.id ?? null,
          guest_name: (v as any).guest?.full_name ?? null,
          guest_email: (v as any).guest?.email ?? null,
          guest_phone: (v as any).guest?.phone ?? null,
          guest_company: (v as any).guest?.guestProfile?.company ?? null,
          host_id: (v as any).assignedHost?.id ?? null,
          host_user_id: (v as any).assignedHost?.user_id ?? null,
          host_name: (v as any).assignedHost?.user?.full_name ?? null,
          host_email: (v as any).assignedHost?.user?.email ?? null,
          office: (v as any).office?.name ?? null,
          department: (v as any).department?.name ?? null,
          service_id: (v as any).service?.id ?? null,
          service: (v as any).service?.name ?? null,
          status: v.status,
          approval_status: latestApproval?.status ?? null,
          credential_status: latestCredential?.status ?? null,
          scheduled_start: v.scheduled_start,
          scheduled_end: v.scheduled_end,
          checked_in_at: v.checked_in_at,
          checked_out_at: v.checked_out_at,
          reference_number: v.reference_number,
          escalated_to_reception: Boolean((v as any).escalated_to_reception),
          escalated_at: (v as any).escalated_at ?? null,
          escalated_by_name: (v as any).escalatedBy?.full_name ?? null,
          assignment_history: Array.isArray((v as any).assignments)
            ? (v as any).assignments.map((a: any) => ({
                id: a.id,
                host_name: a.host?.user?.full_name ?? null,
                assigned_by_name: a.assignedBy?.full_name ?? null,
                assigned_at: a.assigned_at,
                reason: a.assignment_reason,
                is_current: a.is_current,
              }))
            : [],
        };
      }),
    };
  }

  private requireOfficeScope(actor: {
    id?: number;
    roles?: string[];
    office_id?: number;
  }): number {
    return Number(requireActorOfficeId(actor));
  }

  private resolveConfiguredEmailProvider() {
    if (appConfig.isProduction) {
      if (appConfig.smtp.host && appConfig.sendgrid.apiKey)
        return "smtp->sendgrid";
      return appConfig.smtp.host
        ? "smtp"
        : appConfig.sendgrid.apiKey
          ? "sendgrid"
          : "none";
    }

    if (appConfig.sendgrid.apiKey && appConfig.smtp.host)
      return "sendgrid->smtp";
    return appConfig.sendgrid.apiKey
      ? "sendgrid"
      : appConfig.smtp.host
        ? "smtp"
        : "none";
  }

  private buildReportBreakdown<TValue extends string | null, TResult>(
    rows: any[],
    getValue: (row: any) => TValue,
    mapEntry: (
      value: Exclude<TValue, null>,
      count: number,
      percent: number,
    ) => TResult,
  ): TResult[] {
    const counts = new Map<Exclude<TValue, null>, number>();

    for (const row of rows) {
      const value = getValue(row);
      if (value == null) {
        continue;
      }
      counts.set(
        value as Exclude<TValue, null>,
        (counts.get(value as Exclude<TValue, null>) ?? 0) + 1,
      );
    }

    const total = Array.from(counts.values()).reduce(
      (sum, count) => sum + count,
      0,
    );

    return Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1])
      .map(([value, count]) =>
        mapEntry(
          value,
          count,
          total > 0 ? Math.round((count / total) * 100) : 0,
        ),
      );
  }

  private buildRatingInsights(rows: any[]) {
    const ratedRows = rows
      .filter((row) => row.rating !== null && row.rating !== undefined)
      .map((row) => ({
        ...row,
        rating: Number(row.rating),
      }))
      .filter((row) => Number.isFinite(row.rating));

    const totalReviews = ratedRows.length;
    const averageRating =
      totalReviews > 0
        ? ratedRows.reduce((sum, row) => sum + row.rating, 0) / totalReviews
        : 0;

    const recentFeedback = ratedRows
      .filter((row) => String(row.rating_comment ?? "").trim())
      .sort(
        (left, right) =>
          new Date(right.updated_at ?? right.created_at).getTime() -
          new Date(left.updated_at ?? left.created_at).getTime(),
      )
      .slice(0, 10)
      .map((row) => ({
        guest_id: Number(row.guest?.id ?? row.guest_id ?? 0),
        host_name: row.assignedHost?.user?.full_name ?? null,
        rating: row.rating,
        comment: row.rating_comment ?? null,
        created_at: new Date(row.updated_at ?? row.created_at).toISOString(),
      }));

    return {
      average_rating: Number(averageRating.toFixed(1)),
      total_reviews: totalReviews,
      recent_feedback: recentFeedback,
    };
  }

  private buildPunctualityInsights(rows: any[]) {
    const checkedInRows = rows.filter(
      (row) => row.checked_in_at && row.scheduled_start,
    );

    if (!checkedInRows.length) {
      return {
        on_time_percentage: 0,
        avg_delay_minutes: 0,
      };
    }

    const delayMinutes = checkedInRows.map((row) => {
      const scheduled = new Date(row.scheduled_start).getTime();
      const checkedIn = new Date(row.checked_in_at).getTime();
      return Math.max(0, Math.round((checkedIn - scheduled) / 60000));
    });
    const onTimeCount = delayMinutes.filter((minutes) => minutes === 0).length;
    const totalDelayMinutes = delayMinutes.reduce(
      (sum, minutes) => sum + minutes,
      0,
    );

    return {
      on_time_percentage: Math.round(
        (onTimeCount / checkedInRows.length) * 100,
      ),
      avg_delay_minutes: Math.round(totalDelayMinutes / checkedInRows.length),
    };
  }

  private formatRecentActivity(
    raw: { visits: any[]; approvals: any[]; credentials: any[] },
    limit: number,
  ) {
    const entries: Array<{
      id: string;
      title: string;
      detail: string;
      occurred_at: string;
      tone: "neutral" | "success" | "warning" | "critical";
    }> = [
      ...raw.visits.map((visit: any) => ({
        id: `visit-${visit.id}-${visit.updated_at.toISOString()}`,
        title: `Visit ${String(visit.status).toLowerCase()}`,
        detail: `${visit.guest?.full_name ?? "Guest"} is scheduled for ${new Date(visit.scheduled_start).toLocaleString()}.`,
        occurred_at: visit.updated_at.toISOString(),
        tone:
          visit.status === VISIT_STATUS_DECLINED ||
          visit.status === VISIT_STATUS_CANCELLED
            ? ("critical" as const)
            : visit.status === VISIT_STATUS_CHECKED_IN
              ? ("success" as const)
              : ("neutral" as const),
      })),
      ...raw.approvals.map((approval: any) => ({
        id: `approval-${approval.id}`,
        title: `Approval ${String(approval.status).toLowerCase()}`,
        detail: approval.reason
          ? approval.reason
          : `Decision recorded by ${approval.approver?.full_name ?? "staff member"}.`,
        occurred_at: approval.created_at.toISOString(),
        tone:
          approval.status === APPROVAL_DECISION_APPROVED
            ? ("success" as const)
            : ("warning" as const),
      })),
      ...raw.credentials.map((credential: any) => ({
        id: `credential-${credential.id}`,
        title: `Credential ${String(credential.status).toLowerCase()}`,
        detail: `Provider: ${credential.provider}. Access window ends ${new Date(credential.valid_until).toLocaleString()}.`,
        occurred_at: credential.updated_at.toISOString(),
        tone:
          credential.status === CREDENTIAL_STATUS_ACTIVE
            ? ("success" as const)
            : credential.status === CREDENTIAL_STATUS_FAILED
              ? ("critical" as const)
              : ("warning" as const),
      })),
    ];

    return entries
      .sort(
        (a, b) =>
          new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
      )
      .slice(0, limit);
  }

  /**
   * Performs a batch import of organizational data (Offices, Departments, Services).
   */
  public async bulkImportOrg(payload: {
    offices?: any[];
    departments?: any[];
    services?: any[];
    hosts?: any[];
  }) {
    const {
      Office,
      Department,
      Service,
    } = require("../../infrastructure/database/models");
    const results = {
      offices: [] as any[],
      departments: [] as any[],
      services: [] as any[],
      hosts: [] as any[],
    };

    const refreshMaps = async () => {
      const normalize = (s: string) => 
        s.toString().toLowerCase().replace(/[^a-z0-9]/g, '');

      const [offices, depts, svcs] = await Promise.all([
        Office.findAll(),
        Department.findAll(),
        Service.findAll(),
      ]);
      const oMap = new Map<string, number>(
        offices.map((o: any) => [normalize(o.name), Number(o.id)]),
      );
      const dMap = new Map<string, number>(
        depts.map((d: any) => [
          `${d.office_id}:${normalize(d.name)}`,
          Number(d.id),
        ]),
      );
      const sMap = new Map<string, number>(
        svcs.map((s: any) => [
          `${s.department_id}:${normalize(s.name)}`,
          Number(s.id),
        ]),
      );
      return { oMap, dMap, sMap, normalize };
    };

    let { oMap, dMap, sMap, normalize } = await refreshMaps();

    const getVal = (row: any, keys: string[]) => {
      for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null) {
          const val = row[k].toString().trim();
          // Ignore placeholder values
          if (val && val !== '-' && val !== 'N/A' && val !== 'n/a') {
            return val;
          }
        }
      }
      return "";
    };

    const buildMissingNameError = (entity: string, rowNumber: number) =>
      `${entity} name is required on row ${rowNumber}`;

    // 2. Offices
    if (Array.isArray(payload.offices)) {
      for (const [index, row] of payload.offices.entries()) {
        const name = getVal(row, [
          "name",
          "Name",
          "Office",
          "Office Name",
          "office_name",
        ]);
        if (!name) {
          results.offices.push({
            success: false,
            name: `Row ${index + 1}`,
            error: buildMissingNameError("Office", index + 1),
          });
          continue;
        }
        const key = normalize(name);

        if (oMap.has(key)) {
          results.offices.push({ success: true, name, note: "Existing" });
          continue;
        }

        try {
          // Parse latitude/longitude with defaults for Example City
          let latitude = 9.03;
          let longitude = 38.74;
          
          const latRaw = row.latitude || row.Latitude;
          const lonRaw = row.longitude || row.Longitude;
          
          if (latRaw && latRaw !== '-') {
            const parsed = parseFloat(latRaw);
            if (!isNaN(parsed)) latitude = parsed;
          }
          
          if (lonRaw && lonRaw !== '-') {
            const parsed = parseFloat(lonRaw);
            if (!isNaN(parsed)) longitude = parsed;
          }
          
          await Office.create({
            name,
            address: getVal(row, ["address", "Address", "Location"]) || "Not specified",
            city: getVal(row, ["city", "City"]) || "Example City",
            country: getVal(row, ["country", "Country"]) || "Exampleland",
            latitude,
            longitude,
            active: true,
          });
          results.offices.push({ success: true, name, note: "Created" });
        } catch (err: any) {
          results.offices.push({ success: false, name, error: err.message });
        }
      }
      // Refresh map after office creation
      ({ oMap, dMap, sMap, normalize } = await refreshMaps());
    }

    // 3. Departments
    if (Array.isArray(payload.departments)) {
      for (const [index, row] of payload.departments.entries()) {
        const name = getVal(row, [
          "name",
          "Name",
          "Department",
          "Department Name",
          "department_name",
        ]);
        if (!name) {
          results.departments.push({
            success: false,
            name: `Row ${index + 1}`,
            error: buildMissingNameError("Department", index + 1),
          });
          continue;
        }

        try {
          const officeName = getVal(row, [
            "office_name",
            "Office Name",
            "Office",
            "office",
          ]);
          
          // Skip rows with empty office name
          if (!officeName) {
            throw new Error("Office name is required but was empty");
          }
          
          let officeId = oMap.get(normalize(officeName)) || 0;

          if (!officeId) {
            throw new Error(
              `Office not found: "${officeName}". Please add it to the Offices sheet first.`,
            );
          }

          const key = `${officeId}:${normalize(name)}`;
          if (dMap.has(key)) {
            results.departments.push({ success: true, name, note: "Existing" });
            continue;
          }

          await Department.create({ name, office_id: officeId });
          results.departments.push({ success: true, name, note: "Created" });
        } catch (err: any) {
          results.departments.push({
            success: false,
            name,
            error: err.message,
          });
        }
      }
      ({ oMap, dMap, sMap, normalize } = await refreshMaps());
    }

    // 4. Services
    if (Array.isArray(payload.services)) {
      for (const [index, row] of payload.services.entries()) {
        const name = getVal(row, [
          "name",
          "Name",
          "Service",
          "Service Name",
          "service_name",
        ]);
        if (!name) {
          results.services.push({
            success: false,
            name: `Row ${index + 1}`,
            error: buildMissingNameError("Service", index + 1),
          });
          continue;
        }

        try {
          const officeName = getVal(row, [
            "office_name",
            "Office Name",
            "Office",
            "office",
          ]);
          const deptName = getVal(row, [
            "department_name",
            "Department Name",
            "Department",
            "department",
          ]);
          
          // Skip rows with empty office or department name
          if (!officeName) {
            throw new Error("Office name is required but was empty");
          }
          if (!deptName) {
            throw new Error("Department name is required but was empty");
          }
          
          let officeId = oMap.get(normalize(officeName)) || 0;
          let deptId = dMap.get(`${officeId}:${normalize(deptName)}`) || 0;

          if (!officeId) {
            throw new Error(
              `Office not found: "${officeName}". Please add it to the Offices sheet first.`,
            );
          }

          if (!deptId) {
            throw new Error(
              `Department not found: "${deptName}" in office "${officeName}". Please add it to the Departments sheet first.`,
            );
          }

          const key = `${deptId}:${normalize(name)}`;
          if (sMap.has(key)) {
            results.services.push({ success: true, name, note: "Existing" });
            continue;
          }

          // Parse duration, default to 30 if invalid
          const durationRaw = row.duration_minutes || row["Duration (Mins)"] || row["Duration"] || "30";
          let durationMinutes = 30;
          if (durationRaw && durationRaw !== '-') {
            const parsed = parseInt(durationRaw, 10);
            if (!isNaN(parsed) && parsed > 0) {
              durationMinutes = parsed;
            }
          }

          const service = await Service.create({
            name,
            duration_minutes: durationMinutes,
            department_id: deptId,
            office_id: officeId,
          });

          // Handle Assigned Hosts in Services sheet
          const hostsStr = getVal(row, [
            "assigned_hosts",
            "Assigned Hosts",
            "Hosts",
          ]);
          if (hostsStr) {
            const {
              ServiceHost,
              Host,
              User,
            } = require("../../infrastructure/database/models/index");
            const { Op } = require("sequelize");
            const { ServiceRepository } = require("../services/service.repository");
            const hostEmails = hostsStr
              .split(",")
              .map((s: string) => normalize(s))
              .filter(Boolean);
            if (hostEmails.length > 0) {
              // Batch-resolve every email in this row to a host in 2 queries
              // total (was 1 User.findOne + 1 Host.findOne PER email — an
              // N×M sequential round-trip chain across the whole import).
              const hostUsers = await User.findAll({ where: { email: { [Op.in]: hostEmails } } });
              const userIds = hostUsers.map((u: any) => u.id);
              const hostRecords = userIds.length > 0
                ? await Host.findAll({ where: { user_id: { [Op.in]: userIds } } })
                : [];
              if (hostRecords.length > 0) {
                const existing = await ServiceHost.findAll({
                  where: { service_id: service.id, host_id: { [Op.in]: hostRecords.map((h: any) => h.id) } },
                  attributes: ['host_id'],
                });
                const existingHostIds = new Set(existing.map((r: any) => Number(r.host_id)));
                const toCreate = hostRecords.filter((h: any) => !existingHostIds.has(Number(h.id)));
                if (toCreate.length > 0) {
                  await ServiceHost.bulkCreate(
                    toCreate.map((h: any) => ({ service_id: service.id, host_id: h.id })),
                  );
                }
                // Close the same host_ids denormalization gap addServices/
                // removeServices/updateServices already sync — this bulk-import
                // path used to create ServiceHost rows without ever syncing
                // the service's denormalized array, so imported hosts never
                // became eligible for auto-assignment until an unrelated write
                // happened to trigger a resync.
                await new ServiceRepository().syncHostIds(service.id);
              }
            }
          }
          results.services.push({ success: true, name, note: "Created" });
        } catch (err: any) {
          results.services.push({ success: false, name, error: err.message });
        }
      }
      // Critical: refresh sMap so hosts can link to services created in this same import run
      ({ oMap, dMap, sMap } = await refreshMaps());
    }

    // 5. Hosts (New Sheet)
    if (Array.isArray(payload.hosts)) {
      for (const [index, row] of payload.hosts.entries()) {
        const fullName = getVal(row, [
          "full_name",
          "Full Name",
          "Name",
          "name",
        ]);
        const email = getVal(row, [
          "email",
          "Email",
          "Email Address",
        ]).toLowerCase();

        if (!fullName || !email) {
          results.hosts.push({
            success: false,
            name: email || `Row ${index + 1}`,
            error: "Full Name and Email are required for hosts",
          });
          continue;
        }

        try {
          const officeName = getVal(row, [
            "office_name",
            "Office Name",
            "Office",
          ]);
          const deptName = getVal(row, [
            "department_name",
            "Department Name",
            "Department",
          ]);

          let officeId: number = 0;
          const normalizedOffice = officeName ? normalize(officeName) : "";
          if (normalizedOffice) {
            officeId = oMap.get(normalizedOffice) || 0;
            if (!officeId) {
              // Auto-create office with default coordinates
              const newOffice = await Office.create({
                name: officeName,
                address: "Auto-Provisioned",
                city: "Example City",
                country: "Exampleland",
                latitude: 40.7128,
                longitude: -74.0060,
                active: true,
              });
              officeId = Number(newOffice.id);
              oMap.set(normalizedOffice, officeId);
              results.offices.push({ success: true, name: officeName, note: "Auto-Created" });
            }
          }
          if (!officeId) throw new Error(`Office name is missing or empty for host "${email}"`);

          let deptId: number = 0;
          const normalizedDept = deptName ? normalize(deptName) : "";
          if (normalizedDept) {
            deptId = dMap.get(`${officeId}:${normalizedDept}`) || 0;
            if (!deptId) {
              const newDept = await Department.create({
                name: deptName,
                office_id: officeId,
              });
              deptId = Number(newDept.id);
              dMap.set(`${officeId}:${normalizedDept}`, deptId);
              results.departments.push({ success: true, name: deptName, note: "Auto-Created" });
            }
          }
          if (!deptId) throw new Error(`Department name is missing or empty for host "${email}"`);

          const rolesRaw = getVal(row, ["roles", "Roles", "role", "Role"]);
          const roleNames = (rolesRaw || "host")
            .split(",")
            .map((r: string) => r.trim().toLowerCase())
            .filter(Boolean);
          const replaceServiceAssignmentsRaw = getVal(row, [
            "replace_service_assignments",
            "Replace Service Assignments",
            "replace_services",
          ]).toLowerCase();
          const replaceServiceAssignments = ["true", "1", "yes", "y"].includes(
            replaceServiceAssignmentsRaw,
          );
          const activeRaw = getVal(row, [
            "active",
            "Active",
            "status",
            "Status",
          ]).toLowerCase();
          const isActive = ![
            "false",
            "0",
            "no",
            "n",
            "inactive",
            "suspended",
          ].includes(activeRaw);

          // FIX: this bulk import writes User.status/roles directly via the
          // model (see below) instead of going through UserService.updateUser,
          // which is the only place that revokes sessions on deactivation or a
          // role change (see the FIX comment there). A host deactivated or
          // re-roled through a spreadsheet import kept every already-issued
          // token working at its old status/privileges for the token's full
          // remaining lifetime — same gap, different entry point. Mirror that
          // policy here: revoke for any existing user this import touches,
          // since roles are unconditionally replaced below.
          let wasExistingUser = false;
          let syncedUserId: number | null = null;

          await sequelize.transaction(async (t) => {
            let user = await User.findOne({ where: { email }, transaction: t });
            wasExistingUser = !!user;
            if (!user) {
              // Was bcrypt.hash("GMSAdmin@2026", 10) — the same literal the
              // seeders use and the admin UI's own bulk-upload instructions
              // advertise, applied to any email an admin put in a spreadsheet.
              // requires_password_change below is not enforced anywhere, so
              // those accounts were usable immediately with a published
              // password. Random and unusable instead: reaching one of these
              // accounts now requires the emailed reset OTP, SSO, or an admin
              // deliberately setting a password.
              const passwordHash = await hashUnusablePassword();
              if (isActive) await assertSeatAvailable({ email, transaction: t });
              user = await User.create(
                {
                  full_name: fullName,
                  email,
                  password_hash: passwordHash,
                  office_id: officeId,
                  status: isActive ? "ACTIVE" : "INACTIVE",
                  requires_password_change: true,
                },
                { transaction: t },
              );
            } else {
              if (isActive && String(user.status) !== "ACTIVE") {
                await assertSeatAvailable({ email, transaction: t });
              }
              await user.update(
                {
                  full_name: fullName,
                  office_id: officeId,
                  status: isActive ? "ACTIVE" : "INACTIVE",
                },
                { transaction: t },
              );
            }
            syncedUserId = Number(user.id);

            const roleRows = [];
            for (const rName of roleNames) {
              const roleModel = await this.authRepository.ensureRoleByName(rName, t);
              roleRows.push(roleModel);
            }
            if (roleRows.length === 0) {
              throw new Error(
                `No valid roles found for "${email}". Requested roles: ${roleNames.join(", ")}`,
              );
            }
            await UserRole.destroy({
              where: { user_id: user.id },
              transaction: t,
            });
            await Promise.all(
              roleRows.map((role: any) =>
                UserRole.create(
                  { user_id: user!.id, role_id: Number(role.id) },
                  { transaction: t },
                ),
              ),
            );

            await HostProfile.findOrCreate({
              where: { user_id: user.id },
              transaction: t,
            });

            const [host] = await Host.findOrCreate({
              where: { user_id: user.id },
              defaults: {
                office_id: officeId,
                department_id: deptId,
                active: true,
              },
              transaction: t,
            });
            await host.update(
              { office_id: officeId, department_id: deptId, active: isActive },
              { transaction: t },
            );

            const servicesStr = getVal(row, [
              "assigned_services",
              "Assigned Services",
              "Services",
            ]);
            if (replaceServiceAssignments) {
              await ServiceHost.destroy({
                where: { host_id: host.id },
                transaction: t,
              });
            }
            if (servicesStr) {
              const sNames = servicesStr
                .split(",")
                .map((s: string) => normalize(s))
                .filter(Boolean);

              for (const sName of sNames) {
                // Accept explicit service IDs or normalized service names.
                const asNumber = Number(sName);
                let sId =
                  Number.isFinite(asNumber) && asNumber > 0
                    ? asNumber
                    : sMap.get(`${deptId}:${normalize(sName)}`);

                if (!sId && sName) {
                  // Auto-create missing service
                  const newSvc = await Service.create({
                    name: sName,
                    duration_minutes: 30,
                    department_id: deptId,
                    office_id: officeId,
                  });
                  sId = Number(newSvc.id);
                  sMap.set(`${deptId}:${normalize(sName)}`, sId);
                  results.services.push({ success: true, name: sName, note: "Auto-Created" });
                }

                if (sId) {
                  await ServiceHost.findOrCreate({
                    where: { host_id: host.id, service_id: Number(sId) },
                    transaction: t,
                  });
                }
              }
            }
          });

          if (wasExistingUser && syncedUserId) {
            // Static import at the top of this file (P1-13 item 4) — the two
            // dynamic requires hid these call sites from a plain grep for
            // revokeUserSessions, which is how a revocation path goes unnoticed.
            await revokeUserSessions(syncedUserId);
          }

          results.hosts.push({ success: true, name: email, note: "Synced" });
        } catch (err: any) {
          results.hosts.push({
            success: false,
            name: email,
            error: err.message,
          });
        }
      }
    }

    const failureCount =
      results.offices.filter((row) => !row.success).length +
      results.departments.filter((row) => !row.success).length +
      results.services.filter((row) => !row.success).length +
      (results.hosts || []).filter((row: any) => !row.success).length;

    if (failureCount > 0) {
      logger.warn(
        {
          officeRows: payload.offices?.length ?? 0,
          departmentRows: payload.departments?.length ?? 0,
          serviceRows: payload.services?.length ?? 0,
          hostRows: payload.hosts?.length ?? 0,
          failures: failureCount,
        },
        "Bulk organization import completed with row failures",
      );
    }

    return results;
  }

  public async seedSystem() {
    // `db:seed:all` runs every seeder: the legacy password hashes, the demo data and the staff list. Against the live database that is not a setup step, it is an overwrite, so
    // production (and the mirror, which runs in production mode) refuses outright; seeding there is done by hand with the documented npm scripts.
    if (appConfig.isProduction) {
      throw new AppError("System seeding is not available in production.", ErrorCodes.AUTH_FORBIDDEN, 403);
    }
    const backendRoot = this.getBackendRoot();
    const scriptPath = path.join(backendRoot, "scripts", "api-seed-system.js");
    if (!existsSync(scriptPath)) {
      throw new AppError(
        "Seed workflow script is missing from the backend workspace.",
        ErrorCodes.SYSTEM_NOT_FOUND,
        500,
      );
    }

    const runId = randomUUID();
    const { statusFile, outputFile } = this.getSeedRunPaths(runId);
    writeFileSync(
      statusFile,
      `${JSON.stringify(
        {
          run_id: runId,
          mode: appConfig.env,
          status: "queued",
          started_at: new Date().toISOString(),
          finished_at: null,
          output_file: outputFile,
          steps: [],
        },
        null,
        2,
      )}\n`,
    );

    const child = spawn(
      process.execPath,
      [
        scriptPath,
        `--mode=${appConfig.env}`,
        `--run-id=${runId}`,
        `--status-file=${statusFile}`,
        `--output-file=${outputFile}`,
      ],
      {
        cwd: backendRoot,
        detached: true,
        stdio: "ignore",
        env: {
          ...process.env,
          NODE_ENV: appConfig.env,
        },
      },
    );

    child.unref();

    return {
      success: true,
      run_id: runId,
      status: "queued",
      mode: appConfig.env,
      status_url: `/operations/seed/${runId}`,
      status_file: statusFile,
      output_file: outputFile,
      pid: child.pid ?? null,
      timestamp: new Date().toISOString(),
      message:
        "Background seeding started. Poll the status URL to monitor progress.",
    };
  }

  public async getSeedStatus(runId: string) {
    const { statusFile, outputFile } = this.getSeedRunPaths(runId);
    if (!existsSync(statusFile)) {
      throw new AppError(
        "Seed run not found",
        ErrorCodes.SYSTEM_NOT_FOUND,
        404,
      );
    }

    const raw = JSON.parse(readFileSync(statusFile, "utf8"));
    return {
      ...raw,
      output_file: raw.output_file ?? outputFile,
    };
  }
}
