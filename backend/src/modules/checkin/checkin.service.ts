import { VisitService } from '../visits/visit.service';
import { AppError } from '../../core/errors/AppError';
import { ErrorCodes } from '../../core/errors/errorCodes';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue';
import { AuditLog, Visit } from '../../infrastructure/database/models';
import { logAudit } from '../../shared/services/audit.service';
import { GuestService } from '../guests/guest.service';
import { CredentialRepository } from '../credentials/credential.repository';
import { enqueueJob } from '../../infrastructure/events/outbox.service';
import { extractVisitQrCode } from '../../shared/services/visit-qr-link.service';
import { VISIT_POLICY } from '../../config/visit-policy.config';
import { isSuperAdmin, hasGlobalOfficeScope } from '../../shared/auth/roles';
import {
  TERMINAL_VISIT_LIFECYCLE_STATUSES,
  VISIT_STATUS_APPROVED,
  VISIT_STATUS_CHECKED_IN,
  VISIT_STATUS_IN_PROGRESS,
  VISIT_STATUS_PENDING,
  VISIT_STATUS_RESCHEDULED,
} from '../../core/status/status-catalog';

/**
 * Check-in Service
 * Primarily verifies QR codes ahead of UniFi-driven entry confirmation.
 * Staff may optionally force a manual check-in override when UniFi confirmation is unavailable.
 */
export class CheckinService {
  private visitService: VisitService;
  private guestService: GuestService;
  private credentialRepository: CredentialRepository;
  constructor() {
    this.visitService = new VisitService();
    this.guestService = new GuestService();
    this.credentialRepository = new CredentialRepository();
  }

  /**
   * FIX: revoking a credential (lost badge, change of mind, suspicion) used
   * to only update the credential row — the visit stayed APPROVED and
   * check-in never looked at the credential at all, so reception's QR scan
   * or manual override would wave the guest through anyway. Gate both
   * admission paths on there still being a live (PENDING/ACTIVE) credential.
   */
  private async assertCredentialStillActive(visitId: number) {
    const credential = await this.credentialRepository.findActiveByVisitId(visitId);
    if (!credential) {
      throw new AppError(
        "This visit's access credential has been revoked or is no longer active. Check-in is not permitted.",
        ErrorCodes.AUTH_FORBIDDEN,
        403
      );
    }
  }

  /**
   * Security reconciliation for a manual (staff-forced) admission: if the
   * door controller never recorded a physical UNIFI_ACCESS_GRANTED for this
   * visit, write a SECURITY_POLICY_EXCEPTION audit row so reception/security
   * can reconcile it later.
   *
   * History: this used to `require()` `AuditLog` out of audit.service, which
   * does not export it, and filter on a non-existent `entity_type` column
   * (the column is `entity`) -- so the lookup threw (or could never match)
   * and the exception row was never written. If the lookup itself fails we
   * fail toward recording the exception: an extra row is reconcilable, a
   * silently missing one is not.
   */
  private async recordManualOverrideException(
    visitId: number,
    actor: { id: number },
    notes: string,
  ) {
    let physicalEntry: unknown = null;
    try {
      physicalEntry = await AuditLog.findOne({
        where: {
          entity: 'Visit',
          entity_id: String(visitId),
          action: 'UNIFI_ACCESS_GRANTED',
        },
      });
    } catch {
      physicalEntry = null;
    }

    if (!physicalEntry) {
      await logAudit(actor.id, 'SECURITY_POLICY_EXCEPTION', 'Visit', visitId, null, {
        issue: 'Manual check-in performed without a corresponding physical UniFi access grant.',
        severity: 'MEDIUM',
        reconciliation_required: true,
        notes,
      });
    }
  }

  public async checkinByQr(
    qrCode: string,
    actor: { id: number; roles?: string[]; office_id?: number },
    options?: { 
      manual_override?: boolean;
      verification_metadata?: {
        method: 'QR' | 'ID_SCAN' | 'MANUAL';
        verified: boolean;
        notes?: string;
      }
    }
  ) {
    const normalizedQrCode = extractVisitQrCode(qrCode);
    const visit = await Visit.findOne({ where: { qr_code: normalizedQrCode } });

    if (!visit) {
      throw new AppError('Invalid or expired QR code', ErrorCodes.SYSTEM_NOT_FOUND, 404);
    }

    if (visit.status !== VISIT_STATUS_APPROVED) {
      let statusMessage = `Cannot check in a visit with status '${visit.status}'`;
      if (visit.status === VISIT_STATUS_PENDING) statusMessage = 'Visit is still awaiting approval and cannot be checked in yet.';
      if (visit.status === VISIT_STATUS_RESCHEDULED) statusMessage = 'This visit has been rescheduled. Please use the QR code for the new time slot.';
      if (visit.status === VISIT_STATUS_CHECKED_IN || visit.status === VISIT_STATUS_IN_PROGRESS) statusMessage = 'Visitor is already checked in.';
      if ((TERMINAL_VISIT_LIFECYCLE_STATUSES as readonly string[]).includes(visit.status)) statusMessage = `This visit QR code is no longer valid (Status: ${visit.status}).`;

      throw new AppError(statusMessage, ErrorCodes.INVALID_INPUT, 400);
    }

    // Office Restriction: Staff must check in visitors at their own office
    const isStaff = actor.roles && actor.roles.length > 0 && !actor.roles.includes('guest');
    const exempt = hasGlobalOfficeScope(actor.roles ?? []);

    if (isStaff && !exempt && actor.office_id && Number(visit.office_id) !== Number(actor.office_id)) {
      throw new AppError(
        'Location mismatch: This visit is scheduled for a different office. Please ensure the visitor is at the correct building.',
        ErrorCodes.AUTH_FORBIDDEN,
        403
      );
    }

    // QR validity window: only valid within [scheduled_start - grace, scheduled_end + grace]
    const graceMs = VISIT_POLICY.GRACE_PERIOD_MINUTES * 60 * 1000;
    const now = Date.now();
    const windowStart = new Date(visit.scheduled_start).getTime() - graceMs;
    const windowEnd = new Date(visit.scheduled_end).getTime() + graceMs;
    if (now < windowStart) {
      const minutesEarly = Math.ceil((windowStart - now) / 60000);
      throw new AppError(
        `Arrival too early: This QR code will become active in ${minutesEarly} minutes.`,
        ErrorCodes.INVALID_INPUT,
        400
      );
    }

    if (now > windowEnd) {
      throw new AppError(
        'QR code expired: The scheduled visit window (plus grace period) has passed.',
        ErrorCodes.INVALID_INPUT,
        400
      );
    }

    if (!options?.manual_override) {
      // For standard UniFi flow, we just verify the QR but don't mark as CHECKED_IN yet
      // unless it's a specific "Admit" action.
      const visitForActor = await this.visitService.getVisitForActor(visit.id, actor);
      return {
        ...visitForActor,
        checkin_outcome: "VALIDATED_ONLY",
      };
    }

    await this.assertCredentialStillActive(visit.id);

    const { visit: updated, changed } = await this.visitService.processStatusChange(visit.id, actor, VISIT_STATUS_CHECKED_IN);

    // FIX: this used to run unconditionally, even when processStatusChange
    // was a no-op (e.g. a double-click, a client retry, or a UniFi webhook
    // check-in racing this manual one) — the "losing" call would still
    // write a duplicate CHECKIN_PERFORMED audit row, send a second
    // confirmation email, and re-touch the guest's last-visit timestamp.
    // Only run these once, on the call that actually performed the
    // transition.
    if (changed) {
      // Audit the check-in specifics
      await this.recordManualOverrideException(
        visit.id,
        actor,
        'Admitted via QR scan screen with manual override.',
      );
      await logAudit(actor.id, 'CHECKIN_PERFORMED', 'Visit', visit.id, null, {
        method: options.manual_override ? 'MANUAL_OVERRIDE' : 'QR_SCAN',
        identity_verification: options.verification_metadata ?? null,
        timestamp: new Date()
      });

      await enqueueJob(QUEUE_NAMES.EMAIL_NOTIFICATION, 'CheckinConfirmation', {
        visitId: visit.id,
        guestId: visit.guest_id,
        template: 'CHECKED_IN',
      });

      await this.guestService.markGuestVisit(visit.guest_id, new Date());
    }

    return {
      ...updated,
      checkin_outcome: "CHECKED_IN",
    };
  }

  public async manualCheckin(
    visitId: number,
    actor: { id: number; roles?: string[]; office_id?: number },
    metadata?: { notes?: string }
  ) {
    const visit = await Visit.findByPk(visitId);

    if (!visit) {
      throw new AppError('Visit not found', ErrorCodes.SYSTEM_NOT_FOUND, 404);
    }

    if (visit.status !== VISIT_STATUS_APPROVED) {
      let statusMessage = `Cannot check in a visit with status '${visit.status}'`;
      if (visit.status === VISIT_STATUS_PENDING) statusMessage = 'Visit is still awaiting approval.';
      if (visit.status === VISIT_STATUS_CHECKED_IN || visit.status === VISIT_STATUS_IN_PROGRESS) statusMessage = 'Visitor is already checked in.';
      throw new AppError(statusMessage, ErrorCodes.INVALID_INPUT, 400);
    }

    // Office Restriction
    const isStaff = actor.roles && actor.roles.length > 0 && !actor.roles.includes('guest');
    const exempt = hasGlobalOfficeScope(actor.roles ?? []);

    if (isStaff && !exempt && actor.office_id && Number(visit.office_id) !== Number(actor.office_id)) {
      throw new AppError(
        'Location mismatch: Staff can only check in visitors at their assigned office.',
        ErrorCodes.AUTH_FORBIDDEN,
        403
      );
    }

    await this.assertCredentialStillActive(visit.id);

    const { visit: updated, changed } = await this.visitService.processStatusChange(visit.id, actor, VISIT_STATUS_CHECKED_IN);

    // FIX: this whole block used to run unconditionally, even when
    // processStatusChange was a no-op (e.g. this manual override racing a
    // UniFi webhook check-in for the same visit). The "losing" call would
    // still write a duplicate CHECKIN_MANUAL_OVERRIDE (and potentially
    // SECURITY_POLICY_EXCEPTION) audit row and send a second confirmation
    // email. Only run these once, on the call that actually performed the
    // transition.
    if (changed) {
      // Security Reconciliation: was the guest also admitted physically?
      await this.recordManualOverrideException(
        visit.id,
        actor,
        metadata?.notes || 'Admitted via dashboard override.',
      );

      // Audit the manual override specifics

      await logAudit(actor.id, 'CHECKIN_MANUAL_OVERRIDE', 'Visit', visit.id, null, {
        method: 'MANUAL_OVERRIDE_DASHBOARD',
        notes: metadata?.notes || 'Manual check-in performed from dashboard.',
        timestamp: new Date()
      });

      await enqueueJob(QUEUE_NAMES.EMAIL_NOTIFICATION, 'CheckinConfirmation', {
        visitId: visit.id,
        guestId: visit.guest_id,
        template: 'CHECKED_IN',
      });

      await this.guestService.markGuestVisit(visit.guest_id, new Date());
    }

    return {
      ...updated,
      checkin_outcome: "CHECKED_IN",
    };
  }
}
