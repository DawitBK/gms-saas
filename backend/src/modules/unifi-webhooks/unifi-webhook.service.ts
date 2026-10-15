import { appConfig } from '../../config/app.config';
import { createHmac } from 'crypto';
import { constantTimeEquals } from '../../shared/utils/constant-time';
import { AppError } from '../../core/errors/AppError';
import { ErrorCodes } from '../../core/errors/errorCodes';
import { logAudit } from '../../shared/services/audit.service';
import { GuestService } from '../guests/guest.service';
import { NotificationDomainService } from '../notifications/notification.service';
import { VisitService } from '../visits/visit.service';
import { UniFiWebhookRepository } from './unifi-webhook.repository';
import {
  CREDENTIAL_STATUS_ACTIVE,
  CREDENTIAL_STATUS_EXPIRED,
  CREDENTIAL_STATUS_REVOKED,
  VISIT_STATUS_APPROVED,
  VISIT_STATUS_CHECKED_IN,
  VISIT_STATUS_COMPLETED,
  VISIT_STATUS_IN_PROGRESS,
  WEBHOOK_STATUS_FAILED,
  WEBHOOK_STATUS_IGNORED,
  WEBHOOK_STATUS_PROCESSED,
} from '../../core/status/status-catalog';

interface SimpleUniFiWebhookPayload {
  event_id: string;
  event_type: string;
  occurred_at?: string;
  credential_id?: string;
  identity_id?: string;
  qr_code?: string;
  visit_id?: number;
  office_id?: number;
  metadata?: Record<string, unknown>;
}

interface SystemLogPayload {
  topic?: 'door_openings' | 'device_events' | 'admin_activity' | 'visitor';
  '@timestamp'?: string;
  _id?: string;
  _source?: {
    actor?: {
      id?: string;
      type?: string;
      display_name?: string;
      alternate_id?: string;
      alternate_name?: string;
    };
    authentication?: {
      credential_provider?: string;
      issuer?: string;
    };
    event?: {
      display_message?: string;
      published?: number;
      reason?: string;
      result?: string;
      type?: string;
    };
    target?: Array<{
      id?: string;
      type?: string;
      display_name?: string;
      alternate_id?: string;
      alternate_name?: string;
    }>;
    tag?: string;
  };
  [key: string]: unknown;
}

type SystemLogAuthentication = NonNullable<NonNullable<SystemLogPayload['_source']>['authentication']>;
type SystemLogTarget = NonNullable<NonNullable<SystemLogPayload['_source']>['target']>;

interface OfficialWebhookPayload {
  event: string;
  event_object_id: string;
  data?: {
    location?: {
      id?: string;
      location_type?: string;
      name?: string;
      up_id?: string;
      extras?: Record<string, unknown>;
      device_ids?: unknown;
    };
    device?: {
      id?: string;
      name?: string;
      alias?: string;
      device_type?: string;
    } | null;
    actor?: {
      id?: string;
      name?: string;
      type?: string;
    } | null;
    object?: Record<string, unknown>;
  };
  [key: string]: unknown;
}

interface NormalizedUniFiEvent {
  event_id: string;
  event_type: string;
  occurred_at?: string;
  credential_id?: string;
  identity_id?: string;
  qr_code?: string;
  pin_code?: string;
  visit_id?: number;
  office_id?: number;
  metadata?: Record<string, unknown>;
}

const ACCESS_GRANTED_RECORDED_STATUSES = [VISIT_STATUS_CHECKED_IN, VISIT_STATUS_IN_PROGRESS, VISIT_STATUS_COMPLETED] as const;
const ACCESS_GRANTED_ALLOWED_SOURCE_STATUSES = [VISIT_STATUS_APPROVED, ...ACCESS_GRANTED_RECORDED_STATUSES] as const;
const GUEST_EXIT_RECORDED_STATUSES = [VISIT_STATUS_COMPLETED] as const;
const GUEST_EXIT_ALLOWED_SOURCE_STATUSES = [VISIT_STATUS_CHECKED_IN, VISIT_STATUS_IN_PROGRESS, ...GUEST_EXIT_RECORDED_STATUSES] as const;
const SYSTEM_UNIFI_ACTOR = { id: 0, roles: ['super_admin'] as string[] };

export class UniFiWebhookService {
  private repository: UniFiWebhookRepository;
  private visitService: VisitService;

  private notificationService: NotificationDomainService;
  private guestService: GuestService;

  constructor() {
    this.repository = new UniFiWebhookRepository();
    this.visitService = new VisitService();
    this.notificationService = new NotificationDomainService();
    this.guestService = new GuestService();
  }

  // legacySecret: value of x-unifi-webhook-secret header (legacy)
  // payload: parsed JSON body
  // rawBody: raw request body buffer (required for HMAC verification)
  // signatureHeader: value of Signature / x-unifi-signature
  public async processWebhook(
    legacySecret: string | undefined,
    payload: SimpleUniFiWebhookPayload | SystemLogPayload | OfficialWebhookPayload,
    rawBody?: Buffer | string,
    signatureHeader?: string | undefined
  ) {
    if (!appConfig.unifiAccess.webhookSecret) {
      throw new AppError('UniFi webhook secret is not configured', ErrorCodes.SYSTEM_INTERNAL_ERROR, 503);
    }

    // Preferred verification: official Signature header in format t=<unix>,v1=<hex>
    if (signatureHeader) {
      if (!rawBody) {
        throw new AppError('Raw body required for webhook signature verification', ErrorCodes.INVALID_INPUT, 400);
      }

      try {
        const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
        const official = this.parseOfficialSignatureHeader(signatureHeader);

        if (official) {
          const computed = createHmac('sha256', String(appConfig.unifiAccess.webhookSecret))
            .update(String(official.timestamp))
            .update('.')
            .update(bodyBuf)
            .digest();

          if (!constantTimeEquals(computed, official.signature)) {
            throw new Error('signature mismatch');
          }
        } else {
          const computed = createHmac('sha256', String(appConfig.unifiAccess.webhookSecret)).update(bodyBuf).digest('hex');
          const provided = signatureHeader.startsWith('sha256=') ? signatureHeader.split('=')[1] : signatureHeader;
          if (!provided) {
            throw new Error('signature missing');
          }

          if (!constantTimeEquals(Buffer.from(computed, 'hex'), Buffer.from(provided, 'hex'))) {
            throw new Error('signature mismatch');
          }
        }
      } catch {
        throw new AppError('Invalid UniFi webhook signature', ErrorCodes.AUTH_UNAUTHORIZED, 401);
      }
    } else {
      // Legacy: simple secret equality header.
      //
      // This originally used a plain `!==`, then a length-guarded
      // `timingSafeEqual`. Both leak, and this is the one site in the file
      // where the leak is real rather than academic: unlike the two HMAC
      // branches above — whose operands are fixed-width digests — the expected
      // value here is UNIFI_ACCESS_WEBHOOK_SECRET, an operator-chosen string
      // whose length the attacker does not know, compared against a header
      // they fully control. The length short-circuit answered "is your guess
      // the right number of bytes?" on an unauthenticated route. See
      // shared/utils/constant-time.ts.
      if (!constantTimeEquals(String(legacySecret ?? ''), String(appConfig.unifiAccess.webhookSecret))) {
        throw new AppError('Invalid UniFi webhook secret', ErrorCodes.AUTH_UNAUTHORIZED, 401);
      }
    }

    const normalized = this.normalizePayload(payload);
    return this.ingestNormalizedEvent(normalized);
  }

  public async processPolledEvent(payload: SystemLogPayload) {
    const normalized = this.normalizePayload(payload);
    return this.ingestNormalizedEvent(normalized);
  }

  public async replayStoredEvent(id: number) {
    const storedEvent = await this.repository.findEventById(id);
    if (!storedEvent) {
      throw new AppError('Webhook event not found', ErrorCodes.SYSTEM_NOT_FOUND, 404);
    }

    const payload = storedEvent.payload as unknown as NormalizedUniFiEvent;
    await this.repository.resetEventStatus(storedEvent.id);

    try {
      const outcome = await this.applyEvent(payload);
      await this.repository.updateEventStatus(storedEvent.id, outcome.ignored ? WEBHOOK_STATUS_IGNORED : WEBHOOK_STATUS_PROCESSED);
      return {
        id: storedEvent.id,
        status: outcome.ignored ? WEBHOOK_STATUS_IGNORED : WEBHOOK_STATUS_PROCESSED,
        event_id: storedEvent.event_id,
        message: outcome.message,
      };
    } catch (error: any) {
      await this.repository.updateEventStatus(storedEvent.id, WEBHOOK_STATUS_FAILED, error.message);
      throw error;
    }
  }

  private async ingestNormalizedEvent(normalized: NormalizedUniFiEvent) {
    const existing = await this.repository.findEvent('UNIFI_ACCESS', normalized.event_id);
    if (existing) {
      return {
        duplicate: true,
        status: existing.status,
        event_id: normalized.event_id,
      };
    }

    const storedEvent = await this.repository.createEvent({
      source: 'UNIFI_ACCESS',
      event_id: normalized.event_id,
      event_type: normalized.event_type,
      payload: normalized as unknown as Record<string, unknown>,
    });

    try {
      const outcome = await this.applyEvent(normalized);
      await this.repository.updateEventStatus(storedEvent.id, outcome.ignored ? WEBHOOK_STATUS_IGNORED : WEBHOOK_STATUS_PROCESSED);
      return {
        duplicate: false,
        status: outcome.ignored ? WEBHOOK_STATUS_IGNORED : WEBHOOK_STATUS_PROCESSED,
        event_id: normalized.event_id,
        message: outcome.message,
      };
    } catch (error: any) {
      await this.repository.updateEventStatus(storedEvent.id, WEBHOOK_STATUS_FAILED, error.message);
      throw error;
    }
  }

  private normalizePayload(payload: SimpleUniFiWebhookPayload | SystemLogPayload | OfficialWebhookPayload): NormalizedUniFiEvent {
    if ('event_id' in payload && 'event_type' in payload) {
      return payload as NormalizedUniFiEvent;
    }

    if ('event' in payload && 'event_object_id' in payload) {
      const officialPayload = payload as OfficialWebhookPayload;
      const actor = officialPayload.data?.actor ?? undefined;
      const location = officialPayload.data?.location ?? undefined;
      const object = (officialPayload.data?.object ?? {}) as Record<string, unknown>;
      const authenticationType = String(object?.authentication_type ?? '').toUpperCase();
      const authenticationValue =
        typeof object?.authentication_value === 'string' && object.authentication_value.trim()
          ? object.authentication_value
          : undefined;

      return {
        event_id: officialPayload.event_object_id,
        event_type: this.mapOfficialWebhookEvent(officialPayload.event, object),
        occurred_at: undefined,
        identity_id: actor?.type?.toLowerCase() === 'visitor' ? actor.id : undefined,
        qr_code: authenticationType.includes('QR') ? authenticationValue : undefined,
        pin_code: authenticationType.includes('PIN') ? authenticationValue : undefined,
        metadata: {
          actor,
          location,
          object,
          raw_payload: officialPayload,
        },
      };
    }

    const source = payload._source ?? {};
    const topic = payload.topic ?? source.tag;
    const event = source.event ?? {};
    const actor = source.actor ?? {};
    const authentication = source.authentication ?? {};
    const target = source.target ?? [];
    const eventType = this.mapSystemLogEventType(topic, event.type, event.display_message, event.result);
    const eventId =
      payload._id ??
      `${topic ?? 'unifi'}:${event.type ?? 'event'}:${event.published ?? Date.now()}:${actor.id ?? 'unknown'}`;
    const occurredAt =
      payload['@timestamp'] ??
      (event.published ? new Date(event.published).toISOString() : undefined);
    const identityId = actor.type === 'visitor' ? actor.id : undefined;
    const qrCode =
      typeof authentication.issuer === 'string' && authentication.credential_provider?.toUpperCase().includes('QR')
        ? authentication.issuer
        : undefined;
    const metadata = {
      topic: topic ?? null,
      display_message: event.display_message ?? null,
      result: event.result ?? null,
      actor,
      authentication,
      target,
      raw_payload: payload,
    };

    return {
      event_id: eventId,
      event_type: eventType,
      occurred_at: occurredAt,
      identity_id: identityId,
      qr_code: qrCode,
      pin_code: this.extractPinCode(authentication, target),
      metadata,
    };
  }

  private mapOfficialWebhookEvent(event: string, object: Record<string, unknown>) {
    const normalizedEvent = String(event ?? '').trim().toLowerCase();
    const result = String(object?.result ?? '').trim().toLowerCase();

    if (normalizedEvent === 'access.door.unlock') {
      if (result.includes('denied') || result.includes('blocked')) {
        return 'access.denied';
      }

      return 'access.granted';
    }

    if (normalizedEvent === 'access.visitor.status.changed') {
      return 'visitor.updated';
    }

    return normalizedEvent;
  }

  private parseOfficialSignatureHeader(header: string) {
    if (!header.includes('t=') || !header.includes('v1=')) {
      return null;
    }

    const pairs = header.split(',');
    let timestamp: number | null = null;
    let signature: Buffer | null = null;

    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (!key || !value) {
        continue;
      }

      if (key === 't') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          timestamp = parsed;
        }
      }

      if (key === 'v1') {
        try {
          signature = Buffer.from(value, 'hex');
        } catch {
          signature = null;
        }
      }
    }

    if (!timestamp || !signature || signature.length === 0) {
      throw new Error('invalid official signature header');
    }

    return { timestamp, signature };
  }

  private mapSystemLogEventType(
    topic: string | undefined,
    type: string | undefined,
    displayMessage: string | undefined,
    result: string | undefined
  ) {
    const normalizedType = (type ?? '').toLowerCase();
    const normalizedDisplay = (displayMessage ?? '').toLowerCase();
    const normalizedResult = (result ?? '').toLowerCase();

    if (topic === 'door_openings') {
      if (normalizedResult === 'access') return 'access.granted';
      if (normalizedResult === 'blocked' || normalizedDisplay.includes('denied')) return 'access.denied';
    }

    if (topic === 'visitor') {
      if (normalizedDisplay.includes('qr') && normalizedDisplay.includes('assign')) return 'credential.synced';
      if (normalizedDisplay.includes('pin') && normalizedDisplay.includes('assign')) return 'credential.activated';
      if (normalizedDisplay.includes('delete') || normalizedDisplay.includes('cancel')) return 'guest.exit';
    }

    if (topic === 'device_events') {
      if (normalizedType.includes('access_policy') || normalizedDisplay.includes('synchron')) {
        return 'credential.synced';
      }
    }

    if (topic === 'admin_activity') {
      if (normalizedDisplay.includes('visitor') && normalizedDisplay.includes('delete')) return 'access.revoked';
      if (normalizedDisplay.includes('visitor') && normalizedDisplay.includes('update')) return 'visitor.updated';
    }

    return normalizedType || `${topic ?? 'unifi'}.event`;
  }

  private async applyEvent(payload: NormalizedUniFiEvent) {
    switch (payload.event_type) {
      case 'access.granted':
        return this.handleAccessGranted(payload);
      case 'credential.activated':
      case 'credential.synced':
        return this.handleCredentialActivated(payload);
      case 'access.revoked':
      case 'credential.qr.removed':
      case 'credential.pin.removed':
        return this.handleCredentialStatus(payload, CREDENTIAL_STATUS_REVOKED, 'Credential access revoked by UniFi.');
      case 'credential.expired':
        return this.handleCredentialStatus(payload, CREDENTIAL_STATUS_EXPIRED, 'Credential expiry acknowledged from UniFi.');
      case 'access.denied':
        return this.handleAccessDenied(payload);
      case 'guest.exit':
      case 'access.completed':
        return this.handleGuestExit(payload);
      case 'visitor.updated':
        await logAudit(null, 'UNIFI_VISITOR_UPDATED', 'WebhookEvent', payload.event_id, null, payload);
        return { ignored: false, message: 'Visitor update event audited.' };
      default:
        await logAudit(null, 'UNIFI_WEBHOOK_IGNORED', 'WebhookEvent', payload.event_id, null, payload);
        return { ignored: true, message: `Event type ${payload.event_type} is not mapped.` };
    }
  }

  private async handleAccessGranted(payload: NormalizedUniFiEvent) {
    if (this.isExitDirectionEvent(payload)) {
      return { ignored: true, message: 'Exit-direction door activity does not change guest entry state.' };
    }

    const visit = await this.resolveVisit(payload);
    if (!visit) {
      return { ignored: true, message: 'No visit matched the access grant event.' };
    }

    if (ACCESS_GRANTED_RECORDED_STATUSES.includes(visit.status as (typeof ACCESS_GRANTED_RECORDED_STATUSES)[number])) {
      return { ignored: true, message: 'Access grant was already applied to this visit.' };
    }

    if (!ACCESS_GRANTED_ALLOWED_SOURCE_STATUSES.includes(visit.status as (typeof ACCESS_GRANTED_ALLOWED_SOURCE_STATUSES)[number])) {
      return { ignored: true, message: `Visit is not eligible for access grant handling from status ${visit.status}.` };
    }

    if (visit.status === VISIT_STATUS_APPROVED) {
      // FIX: the status checks above read the visit BEFORE this call takes
      // its own FOR UPDATE lock, so they can't see a concurrent mutation —
      // e.g. a manual check-in (checkin.service.ts) committing between this
      // read and the lock. When that happens, processStatusChange resolves
      // this as a no-op (visit already CHECKED_IN) rather than throwing.
      // Skip the notification/markGuestVisit/audit below in that case so
      // the race doesn't produce a duplicate of each for this visit.
      const { changed } = await this.visitService.processStatusChange(visit.id, SYSTEM_UNIFI_ACTOR, VISIT_STATUS_CHECKED_IN);
      if (!changed) {
        return { ignored: true, message: 'Access grant already applied to this visit (lost a race with another check-in).' };
      }
    }

    await this.notificationService.createNotification(
      visit.guest_id,
      'Guest Entry Logged',
      'Your entry event was received from UniFi Access and recorded successfully.',
      'ENTRY_LOGGED',
      payload.metadata
    );
    await this.guestService.markGuestVisit(visit.guest_id, payload.occurred_at ? new Date(payload.occurred_at) : new Date());
    await logAudit(null, 'UNIFI_ACCESS_GRANTED', 'Visit', visit.id, null, payload);

    return { ignored: false, message: 'Access grant processed.' };
  }

  private async handleCredentialActivated(payload: NormalizedUniFiEvent) {
    const credential = await this.resolveCredential(payload);
    if (!credential) {
      return { ignored: true, message: 'No credential matched the UniFi event.' };
    }

    const currentMetadata = ((credential as any).metadata ?? {}) as Record<string, unknown>;
    if ((credential as any).status === CREDENTIAL_STATUS_ACTIVE && currentMetadata.sync_confirmed_at) {
      return { ignored: true, message: 'Credential activation was already recorded.' };
    }

    await this.repository.updateCredential(credential.id, {
      status: CREDENTIAL_STATUS_ACTIVE,
      provisioned_at: new Date(),
      metadata: {
        ...currentMetadata,
        webhook_event_type: payload.event_type,
        sync_confirmed_at: payload.occurred_at ?? new Date().toISOString(),
      },
    });

    const visit = (credential as any).Visit;
    if (visit) {
      await this.notificationService.createNotification(
        visit.guest_id,
        'Access Credential Confirmed',
        'UniFi Access confirmed that your credential is active and ready to use.',
        'CREDENTIAL_SYNCED',
        payload.metadata
      );
    }

    await logAudit(null, 'UNIFI_CREDENTIAL_ACTIVE', 'AccessCredential', credential.id, null, payload);
    return { ignored: false, message: 'Credential activation recorded.' };
  }

  private async handleAccessDenied(payload: NormalizedUniFiEvent) {
    if (this.isExitDirectionEvent(payload)) {
      return { ignored: true, message: 'Exit-direction door activity does not notify guests about denied entry.' };
    }

    const visit = await this.resolveVisit(payload);
    if (visit) {
      await this.notificationService.createNotification(
        visit.guest_id,
        'Access Attempt Denied',
        'A door access attempt was denied. Please contact reception if you still need help entering.',
        'ACCESS_DENIED',
        payload.metadata
      );
      await logAudit(null, 'UNIFI_ACCESS_DENIED', 'Visit', visit.id, null, payload);
      return { ignored: false, message: 'Denied access event recorded against the visit.' };
    }

    await logAudit(null, 'UNIFI_ACCESS_DENIED', 'WebhookEvent', payload.event_id, null, payload);
    return { ignored: false, message: 'Denied access event recorded.' };
  }

  private async handleGuestExit(payload: NormalizedUniFiEvent) {
    const visit = await this.resolveVisit(payload);
    if (!visit) {
      return { ignored: true, message: 'No visit matched the exit event.' };
    }

    if (GUEST_EXIT_RECORDED_STATUSES.includes(visit.status as (typeof GUEST_EXIT_RECORDED_STATUSES)[number])) {
      return { ignored: true, message: 'Guest exit was already applied to this visit.' };
    }

    if (!GUEST_EXIT_ALLOWED_SOURCE_STATUSES.includes(visit.status as (typeof GUEST_EXIT_ALLOWED_SOURCE_STATUSES)[number])) {
      return { ignored: true, message: `Visit is not eligible for exit handling from status ${visit.status}.` };
    }

    if (visit.status === VISIT_STATUS_CHECKED_IN || visit.status === VISIT_STATUS_IN_PROGRESS) {
      // FIX: same race as handleAccessGranted above — the status checks
      // above read the visit before this call's own FOR UPDATE lock, so a
      // concurrent completion (e.g. two exit events, or an admin manually
      // completing the visit) can already have applied by the time the lock
      // is acquired. Skip the notification/audit below when that happens so
      // it isn't recorded twice for this visit.
      const { changed } = await this.visitService.processStatusChange(visit.id, SYSTEM_UNIFI_ACTOR, VISIT_STATUS_COMPLETED);
      if (!changed) {
        return { ignored: true, message: 'Guest exit already applied to this visit (lost a race with another completion).' };
      }
    }

    await this.notificationService.createNotification(
      visit.guest_id,
      'Visit Completed',
      'Your exit or completion event was recorded from UniFi Access.',
      'VISIT_COMPLETED',
      payload.metadata
    );
    await logAudit(null, 'UNIFI_GUEST_EXIT', 'Visit', visit.id, null, payload);
    return { ignored: false, message: 'Guest exit processed.' };
  }

  private async handleCredentialStatus(
    payload: NormalizedUniFiEvent,
    status: typeof CREDENTIAL_STATUS_REVOKED | typeof CREDENTIAL_STATUS_EXPIRED,
    message: string
  ) {
    const credential = await this.resolveCredential(payload);
    if (!credential) {
      return { ignored: true, message: 'No credential matched the UniFi event.' };
    }

    if ((credential as any).status === status) {
      return { ignored: true, message: `Credential status ${status} was already recorded.` };
    }

    await this.repository.updateCredential(credential.id, {
      status,
      revoked_at: new Date(),
      metadata: {
        ...((credential as any).metadata ?? {}),
        webhook_event_type: payload.event_type,
      },
    });

    const visit = (credential as any).Visit;
    if (visit) {
      await this.notificationService.createNotification(
        visit.guest_id,
        status === CREDENTIAL_STATUS_EXPIRED ? 'Credential Expired' : 'Credential Revoked',
        status === CREDENTIAL_STATUS_EXPIRED
          ? 'Your guest access window has expired.'
          : 'Your UniFi guest access was revoked.',
        status === CREDENTIAL_STATUS_EXPIRED ? 'CREDENTIAL_EXPIRED' : 'CREDENTIAL_REVOKED',
        payload.metadata
      );
    }

    await logAudit(null, `UNIFI_CREDENTIAL_${status}`, 'AccessCredential', credential.id, null, payload);
    return { ignored: false, message };
  }

  private async resolveCredential(payload: NormalizedUniFiEvent) {
    if (payload.credential_id) {
      const byCredentialId = await this.repository.findCredentialByExternalId(payload.credential_id);
      if (byCredentialId) return byCredentialId;
    }

    if (payload.identity_id) {
      const byIdentityId = await this.repository.findCredentialByExternalIdentityId(payload.identity_id);
      if (byIdentityId) return byIdentityId;
    }

    if (payload.pin_code) {
      return this.repository.findCredentialByPinCode(payload.pin_code);
    }

    return null;
  }

  private async resolveVisit(payload: NormalizedUniFiEvent) {
    if (payload.visit_id) {
      return this.repository.findVisitById(payload.visit_id);
    }

    const credential = await this.resolveCredential(payload);
    if (credential) {
      return (credential as any).Visit ?? null;
    }

    if (payload.qr_code) {
      return this.repository.findVisitByQrCode(payload.qr_code);
    }

    return null;
  }

  private extractPinCode(
    authentication: Partial<SystemLogAuthentication>,
    target: SystemLogTarget
  ) {
    const provider = String(authentication?.credential_provider ?? '').toUpperCase();
    if (provider.includes('PIN') && typeof authentication?.issuer === 'string' && authentication.issuer.trim()) {
      return authentication.issuer.trim();
    }

    const pinTarget = (target ?? []).find((item) => String(item?.type ?? '').toLowerCase().includes('pin'));
    const pinCandidate = typeof pinTarget?.id === 'string' && pinTarget.id.trim() ? pinTarget.id.trim() : undefined;
    return pinCandidate;
  }

  private isExitDirectionEvent(payload: NormalizedUniFiEvent) {
    const metadata = (payload.metadata ?? {}) as Record<string, unknown>;
    const target = Array.isArray(metadata.target) ? (metadata.target as Array<Record<string, unknown>>) : [];
    const directionTarget = target.find((item) => String(item?.type ?? '').toLowerCase() === 'device_config');
    const targetDirection = String(directionTarget?.display_name ?? directionTarget?.id ?? '').trim().toLowerCase();
    if (targetDirection === 'exit') {
      return true;
    }

    const location = metadata.location as Record<string, unknown> | undefined;
    const object = metadata.object as Record<string, unknown> | undefined;
    const locationExtras =
      location && typeof location.extras === 'object' && location.extras
        ? (location.extras as Record<string, unknown>)
        : undefined;
    const officialDirection = String(
      object?.entry_method ?? object?.direction ?? locationExtras?.direction ?? ''
    )
      .trim()
      .toLowerCase();

    return officialDirection === 'exit';
  }
}
