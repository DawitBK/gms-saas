import { randomInt } from "crypto";
import { AppError } from "../../core/errors/AppError";
import { ErrorCodes } from "../../core/errors/errorCodes";
import { CredentialRepository } from "./credential.repository";
import { mapCredentialToDTO } from "./credential.dto";
import { UniFiAccessService } from "../../infrastructure/unifi/unifi.service";
import { logAudit } from "../../shared/services/audit.service";
import { NotificationDomainService } from "../notifications/notification.service";
import { QUEUE_NAMES } from "../../infrastructure/queue/queue";
import {
  publishEvent,
  enqueueJob,
} from "../../infrastructure/events/outbox.service";
import { EventTypes } from "../../infrastructure/events/eventTypes";
import { buildVisitScanUrl } from "../../shared/services/visit-qr-link.service";
import {
  hasGlobalOfficeScope,
  isAdminRole,
  isHostRole,
  isReceptionRole,
  normalizeRoles,
} from "../../shared/auth/roles";
import { requireActorOfficeId } from "../../shared/auth/scope-resolver";
import { appConfig } from "../../config/app.config";
import { computeCredentialValidityWindow } from "../../config/visit-policy.config";
import { VISIT_STATUS_GROUPS } from "../visits/visit-statuses";
import {
  CREDENTIAL_STATUS_ACTIVE,
  CREDENTIAL_STATUS_EXPIRED,
  CREDENTIAL_STATUS_FAILED,
  CREDENTIAL_STATUS_PENDING,
  CREDENTIAL_STATUS_REVOKED,
} from "../../shared/domain/status-catalog";
import { withTransaction } from "../../core/db/transaction";

export class CredentialService {
  private credentialRepository: CredentialRepository;
  private unifiService: UniFiAccessService;
  private notificationService: NotificationDomainService;

  constructor() {
    this.credentialRepository = new CredentialRepository();
    this.unifiService = new UniFiAccessService();
    this.notificationService = new NotificationDomainService();
  }

  public async ensureCredentialsForVisit(visitId: number, actorId: number) {
    const reservation = await withTransaction(async (transaction) => {
      const visit = await this.credentialRepository.findVisitContextForUpdate(
        visitId,
        transaction,
      );
      if (!visit) {
        throw new AppError(
          "Visit not found for credential provisioning",
          ErrorCodes.SYSTEM_NOT_FOUND,
          404,
        );
      }

      const visitStatus = String((visit as any).status);
      const readyStatuses = new Set<string>(VISIT_STATUS_GROUPS.READY_ARRIVALS);
      if (!readyStatuses.has(visitStatus)) {
        throw new AppError(
          "Credentials can only be provisioned for approved or active visits",
          ErrorCodes.INVALID_INPUT,
          400,
        );
      }

      const existing =
        await this.credentialRepository.findProvisioningCandidateByVisitId(
          visitId,
          transaction,
        );
      let revokedCredentialToSync: { externalId: string | null } | null = null;
      if (
        existing &&
        String((existing as any).status) === CREDENTIAL_STATUS_ACTIVE
      ) {
        // If the QR code has changed (e.g. via regeneration or guest decision),
        // we must not return existing_active so that re-provisioning occurs.
        const currentQr = (visit as any).qr_code;
        const credentialQr = (existing as any).metadata?.qr_code;

        if (currentQr === credentialQr) {
          return {
            mode: "existing_active" as const,
            credential: existing,
          };
        }

        // FIX: the old ACTIVE credential used to just be left in place while
        // a new one was provisioned — the OLD QR/PIN kept opening doors in
        // UniFi indefinitely. Worse, a migration enforces exactly one
        // active-or-pending credential per visit, so inserting the new row
        // below while this one was still ACTIVE would throw a unique
        // constraint violation and abort the whole re-provisioning. Mark it
        // REVOKED here (in the same transaction as the new row's creation);
        // the actual UniFi revocation call happens after the transaction
        // commits, alongside the new credential's UniFi provisioning call,
        // matching this method's existing DB-then-UniFi ordering.
        await this.credentialRepository.updateCredential(
          (existing as any).id,
          {
            status: CREDENTIAL_STATUS_REVOKED,
            revoked_at: new Date(),
            metadata: {
              ...((existing as any).metadata ?? {}),
              revocation_reason: "superseded_by_qr_regeneration",
            },
          },
          transaction,
        );
        revokedCredentialToSync = {
          externalId:
            (existing as any).external_identity_id ??
            (existing as any).external_credential_id ??
            null,
        };
        // QR mismatch: We will proceed to treat this as a candidate for re-provisioning
      }

      const credentialWindow = computeCredentialValidityWindow(
        new Date((visit as any).scheduled_start),
        new Date((visit as any).scheduled_end),
        Boolean((visit as any).is_vip),
      );
      const qrUrl = buildVisitScanUrl((visit as any).qr_code);

      if (
        existing &&
        String((existing as any).status) === CREDENTIAL_STATUS_PENDING
      ) {
        return {
          mode: "pending_ready" as const,
          visit,
          pendingCredential: existing,
          pinCode:
            (existing as any).pin?.pin_code ??
            (existing as any).metadata?.pin_code ??
            null,
          pinId: (existing as any).pin?.id ?? null,
          credentialWindow,
          revokedCredentialToSync,
        };
      }

      // FIX: the fallback PIN generator had no collision check against other
      // active PINs and no unique DB index — a collision could attribute a
      // real door scan to the wrong guest. Steer away from an in-use PIN
      // before handing it off; a hard unique index (see migration
      // 20260711000000) is the actual backstop if this races anyway.
      let candidatePinCode = this.generatePinCode();
      for (
        let attempt = 0;
        attempt < 5 &&
        (await this.credentialRepository.isPinCodeInActiveUse(candidatePinCode, transaction));
        attempt++
      ) {
        candidatePinCode = this.generatePinCode();
      }

      const provisioningPinCode = await this.unifiService.preparePinCode(
        candidatePinCode,
      );
      const pin = await this.credentialRepository.createPin(
        {
          visit_id: visitId,
          pin_code: provisioningPinCode,
          expires_at: credentialWindow.validUntil,
        },
        transaction,
      );

      const pendingCredential =
        await this.credentialRepository.createCredential(
          {
            visit_id: visitId,
            pin_id: (pin as any).id,
            credential_type: "QR",
            provider: "UNIFI_ACCESS",
            status: CREDENTIAL_STATUS_PENDING,
            valid_from: credentialWindow.validFrom,
            valid_until: credentialWindow.validUntil,
            metadata: {
              qr_code: (visit as any).qr_code,
              ...(qrUrl ? { qr_url: qrUrl } : {}),
              pin_code: provisioningPinCode,
            },
          },
          transaction,
        );

      return {
        mode: "pending_ready" as const,
        visit,
        pendingCredential,
        pinCode: provisioningPinCode,
        pinId: (pin as any).id,
        credentialWindow,
        revokedCredentialToSync,
      };
    });

    if (reservation.mode === "existing_active") {
      return mapCredentialToDTO(reservation.credential);
    }

    const visit = reservation.visit as any;
    const guest = visit.guest;
    const pendingCredential = reservation.pendingCredential as any;
    const provisioningPinCode = reservation.pinCode;
    if (!provisioningPinCode) {
      throw new AppError(
        "Pending credential is missing a provisioning PIN",
        ErrorCodes.SYSTEM_INTERNAL_ERROR,
        500,
      );
    }

    // The old credential was marked REVOKED in the DB inside the
    // transaction above; actually tell UniFi to revoke it now, alongside
    // the new credential's own UniFi provisioning call below. A failure
    // here is logged, not thrown — this mirrors expireVisitCredentials'
    // own error handling, and must not block issuing the new credential.
    if (reservation.revokedCredentialToSync?.externalId) {
      try {
        await this.unifiService.revokeGuestAccess(
          reservation.revokedCredentialToSync.externalId,
        );
      } catch (error) {
        const { logger } = await import("../../core/logger/logger.js");
        logger.warn(
          { error, visitId, externalId: reservation.revokedCredentialToSync.externalId },
          "Failed to revoke superseded credential in UniFi Access",
        );
      }
    }

    try {
      const doorIds = await this.unifiService.resolveDoorIds(
        (visit as any).office_id,
      );
      const provisioned = await this.unifiService.provisionGuestAccess({
        visitId: (visit as any).id,
        guestName: guest?.full_name ?? "Guest",
        guestEmail: guest?.email ?? "",
        guestPhone: guest?.phone ?? null,
        guestCompany: (guest as any)?.guestProfile?.company ?? null,
        qrCode: (visit as any).qr_code,
        pinCode: provisioningPinCode,
        officeId: (visit as any).office_id,
        validFrom: reservation.credentialWindow.validFrom,
        validUntil: reservation.credentialWindow.validUntil,
        doorIds,
      });

      const actualPinCode =
        typeof provisioned.metadata?.pin_code === "string"
          ? provisioned.metadata.pin_code
          : provisioningPinCode;
      if (reservation.pinId && actualPinCode !== provisioningPinCode) {
        await this.credentialRepository.updatePin(reservation.pinId, {
          pin_code: actualPinCode,
        });
      }

      const activeCredential = await this.credentialRepository.updateCredential(
        pendingCredential.id,
        {
          provider: provisioned.provider,
          status: CREDENTIAL_STATUS_ACTIVE,
          external_credential_id: provisioned.externalCredentialId,
          external_identity_id: provisioned.externalIdentityId,
          door_ids: provisioned.doorIds,
          provisioned_at: new Date(),
          metadata: {
            ...(pendingCredential.metadata ?? {}),
            ...(provisioned.metadata ?? {}),
            pin_code: actualPinCode,
          },
        },
      );

      await logAudit(
        actorId,
        "CREDENTIAL_PROVISIONED",
        "AccessCredential",
        pendingCredential.id,
        null,
        {
          visit_id: visitId,
          provider: provisioned.provider,
          door_ids: provisioned.doorIds,
        },
      );

      await this.notificationService.createNotification(
        (visit as any).guest_id,
        "Visit Access Ready",
        "Your visit has been approved and your access credential is now active.",
        "CREDENTIAL_ACTIVE",
      );

      // Pulse an event to the outbox so the frontend (realtime gateway) can update the UI
      await publishEvent(
        {
          type: EventTypes.VISIT_CREDENTIAL_ACTIVE,
          metadata: {
            entity_id: visitId,
            office_id: (visit as any).office_id,
            actor_id: actorId,
            timestamp: new Date(),
          },
        },
        undefined,
        { type: "Visit", id: visitId },
      );

      await enqueueJob(
        QUEUE_NAMES.EMAIL_NOTIFICATION,
        "VisitApprovedEmail",
        {
          visitId,
          guestId: (visit as any).guest_id,
          template: "APPROVED",
          credentialId: pendingCredential.id,
          actorId,
        },
        undefined,
        { type: "Visit", id: visitId },
      );

      await enqueueJob(QUEUE_NAMES.VISIT_REMINDER, "ApprovedVisitReminder", {
        visitId: (visit as any).id,
        guestId: (visit as any).guest_id,
        hostId: (visit as any).assigned_host_id ?? null,
        scheduledStart: (visit as any).scheduled_start,
      });

      return mapCredentialToDTO(activeCredential);
    } catch (error: any) {
      await this.credentialRepository.updateCredential(pendingCredential.id, {
        status: CREDENTIAL_STATUS_FAILED,
        metadata: {
          ...(pendingCredential.metadata ?? {}),
          failure_reason: error.message,
        },
      });
      throw new AppError(
        "Failed to provision access credential",
        ErrorCodes.SYSTEM_INTERNAL_ERROR,
        500,
      );
    }
  }

  public async revokeVisitCredentials(
    visitId: number,
    actorId: number,
    reason?: string,
    actor?: { id: number; roles?: string[]; office_id?: number },
  ) {
    // Was gated on role alone — a host or receptionist at Office A could
    // revoke a live UniFi credential for a visit at Office B, locking a
    // stranger's visitor out of the building mid-visit. Same rule as reading
    // the credential, since revoking is the more damaging of the two.
    if (actor) {
      await this.assertActorMayAccessVisitCredentials(visitId, actor);
    }

    const credential =
      await this.credentialRepository.findActiveByVisitId(visitId);
    if (!credential) {
      throw new AppError(
        "No active credential found for visit",
        ErrorCodes.SYSTEM_NOT_FOUND,
        404,
      );
    }

    await this.unifiService.revokeGuestAccess(
      credential.external_identity_id ?? credential.external_credential_id,
    );
    const updated = await this.credentialRepository.updateCredential(
      credential.id,
      {
        status: CREDENTIAL_STATUS_REVOKED,
        revoked_at: new Date(),
        metadata: {
          ...(credential.metadata ?? {}),
          revocation_reason: reason ?? "manual_revocation",
        },
      },
    );

    await logAudit(
      actorId,
      "CREDENTIAL_REVOKED",
      "AccessCredential",
      credential.id,
      null,
      {
        visit_id: visitId,
        reason: reason ?? null,
      },
    );

    return mapCredentialToDTO(updated);
  }

  public async expireVisitCredentials(visitId: number) {
    const credential =
      await this.credentialRepository.findActiveByVisitId(visitId);
    if (!credential) {
      return null;
    }

    await this.unifiService.revokeGuestAccess(
      credential.external_identity_id ?? credential.external_credential_id,
    );
    const updated = await this.credentialRepository.updateCredential(
      credential.id,
      {
        status: CREDENTIAL_STATUS_EXPIRED,
        revoked_at: new Date(),
        metadata: {
          ...(credential.metadata ?? {}),
          expiry_processed: true,
        },
      },
    );

    return mapCredentialToDTO(updated);
  }

  public async updateCredentialValidity(visitId: number, validUntil: Date) {
    const credential = await this.credentialRepository.findActiveByVisitId(visitId);
    if (!credential) {
      return;
    }

    const pinId = (credential as any).pin_id;
    if (pinId) {
      await this.credentialRepository.updatePin(pinId, { expires_at: validUntil });
    }

    await this.credentialRepository.updateCredential(credential.id, {
      valid_until: validUntil,
    });

    if (credential.provider === "UNIFI_ACCESS" && credential.external_identity_id) {
      try {
        await this.unifiService.updateVisitorValidity(credential.external_identity_id, validUntil);
      } catch (error) {
        const { logger } = await import("../../core/logger/logger.js");
        logger.warn({ error, visitId, credentialId: credential.id }, "Failed to update UniFi visitor validity during extension");
      }
    }
  }

  /**
   * The single most recent credential for a visit, regardless of status —
   * backs visit.controller.ts's QR-download endpoint, which previously
   * queried AccessCredential directly (a controller→model layering
   * violation). Returns the raw model (not DTO-mapped): the only caller
   * needs `.metadata` for PNG rendering, not the full credential shape.
   */
  public async getCurrentCredentialForVisit(visitId: number) {
    return this.credentialRepository.getCurrentCredentialForVisit(visitId);
  }

  public async listVisitCredentials(visitId: number) {
    const credentials = await this.credentialRepository.listByVisitId(visitId);
    return credentials.map(mapCredentialToDTO);
  }

  /**
   * The one access rule for everything to do with a visit's credentials —
   * reading the PIN and QR, revoking the door access, or minting a fallback QR.
   *
   * What is behind these endpoints is physical: the visit's live door PIN, kept
   * in plaintext in the credential's `metadata`, and its access QR. Whoever can
   * read it can walk through the door; whoever can revoke it can lock a
   * legitimate visitor out mid-visit.
   *
   * Previously each endpoint decided for itself, and two of the three decided
   * nothing at all: `revokeVisitCredentials` and `provisionFallbackQr` were
   * gated on role only, with no office or ownership check, so a host or
   * receptionist at one office could revoke a live UniFi credential for a visit
   * at another. Having one guard means the three cannot drift apart again.
   */
  private async assertActorMayAccessVisitCredentials(
    visitId: number,
    actor: { id: number; roles?: string[]; office_id?: number },
  ): Promise<void> {
    const visit =
      await this.credentialRepository.findVisitAccessContext(visitId);
    if (!visit) {
      throw new AppError(
        "Visit not found for credential lookup",
        ErrorCodes.SYSTEM_NOT_FOUND,
        404,
      );
    }

    const roles = normalizeRoles(actor.roles ?? []);
    const actorId = Number(actor.id);
    const visitGuestId = Number((visit as any).guest_id);
    const visitOfficeId = Number((visit as any).office_id);
    const visitAssignedHostId = (visit as any).assigned_host_id;

    // The guest themselves, always.
    if (visitGuestId === actorId) return;

    // Global roles are global by definition.
    if (hasGlobalOfficeScope(roles)) return;

    const isFrontDesk = roles.some(
      (role) => isAdminRole(role) || isReceptionRole(role),
    );
    const isHost = roles.some((role) => isHostRole(role));

    if (!isFrontDesk && !isHost) {
      throw new AppError(
        "You do not have access to these credentials",
        ErrorCodes.AUTH_FORBIDDEN,
        403,
      );
    }

    /**
     * Fix 1: an office-scoped staff account with no office assignment used to
     * skip the office check entirely — `actorOfficeId &&` is falsy for both
     * `undefined` and `0`, so the comparison never ran and the caller could
     * read credentials for any visit at any office. A missing office is now
     * the narrowest case, not the widest: requireActorOfficeId throws.
     */
    const actorOfficeId = requireActorOfficeId(
      { id: actorId, roles, office_id: actor.office_id },
      "Credential lookup requires an office assignment",
    );

    if (visitOfficeId !== actorOfficeId) {
      throw new AppError(
        "Credential lookup is outside your office scope",
        ErrorCodes.AUTH_FORBIDDEN,
        403,
      );
    }

    /**
     * Fix 2: a host used to be treated as "privileged" and checked only on
     * office, so ANY host at the site could pull up ANY colleague's visitor's
     * live PIN. Reception and admin run the front desk and legitimately need
     * every visit at their office; a host needs the visits assigned to them.
     *
     * `visits.assigned_host_id` references `hosts.id`, not `users.id` — the
     * actor's user id has to be resolved to their host row first, the same way
     * VisitScopePolicy does it.
     */
    if (!isFrontDesk) {
      const hostId = await this.credentialRepository.findHostIdByUserId(actorId);
      if (!hostId || Number(visitAssignedHostId ?? 0) !== hostId) {
        throw new AppError(
          "You can only act on credentials for visits assigned to you",
          ErrorCodes.AUTH_FORBIDDEN,
          403,
        );
      }
    }
  }

  public async listVisitCredentialsForActor(
    visitId: number,
    actor: { id: number; roles?: string[]; office_id?: number },
  ) {
    await this.assertActorMayAccessVisitCredentials(visitId, actor);
    return this.listVisitCredentials(visitId);
  }

  public async provisionFallbackQr(
    visitId: number,
    actorId: number,
    actor?: { id: number; roles?: string[]; office_id?: number },
  ) {
    // Same omission as revokeVisitCredentials: role-gated, never scoped.
    if (actor) {
      await this.assertActorMayAccessVisitCredentials(visitId, actor);
    }

    if (appConfig.isProduction) {
      throw new AppError(
        "Fallback internal credentials are disabled in production. Use the UniFi-issued credential instead.",
        ErrorCodes.INVALID_INPUT,
        400,
      );
    }

    const visit = await this.credentialRepository.findVisitContext(visitId);
    if (!visit) {
      throw new AppError(
        "Visit not found for fallback provisioning",
        ErrorCodes.SYSTEM_NOT_FOUND,
        404,
      );
    }

    const credential =
      await this.credentialRepository.findActiveByVisitId(visitId);
    if (!credential) {
      // If there's no credential at all, we'll try to ensure one normally first,
      // but force internal mode in UniFi service if needed.
      // For simplicity, we'll just update a pending/failed one if it exists.
      throw new AppError(
        "No active or pending credential found to fallback",
        ErrorCodes.SYSTEM_NOT_FOUND,
        404,
      );
    }

    // Force system mode in metadata
    const updated = await this.credentialRepository.updateCredential(
      credential.id,
      {
        status: CREDENTIAL_STATUS_ACTIVE,
        provider: "INTERNAL",
        provisioned_at: new Date(),
        metadata: {
          ...(credential.metadata ?? {}),
          qr_delivery_source: "system",
          manual_override: true,
          overridden_by: actorId,
          overridden_at: new Date(),
        },
      },
    );

    await logAudit(
      actorId,
      "CREDENTIAL_FALLBACK_TRIGGERED",
      "AccessCredential",
      credential.id,
      null,
      {
        visit_id: visitId,
        provider: "INTERNAL",
      },
    );

    // Notify guest again
    await enqueueJob(
      QUEUE_NAMES.EMAIL_NOTIFICATION,
      "VisitApprovedEmail",
      {
        visitId,
        guestId: (visit as any).guest_id,
        template: "APPROVED",
        credentialId: credential.id,
        actorId,
      },
      undefined,
      { type: "Visit", id: visitId },
    );

    return mapCredentialToDTO(updated);
  }

  private generatePinCode() {
    return String(randomInt(100000, 999999));
  }
}
