import { createHash } from 'crypto';
import { appConfig } from '../../config/app.config';
import { logger } from '../../core/logger/logger';
import { UniFiAccessClient } from './unifi.client';
import { ProvisionAccessInput, ProvisionAccessResult, UniFiResourceBinding, UniFiSystemLogHit } from './unifi.types';
import { buildPngDataUri, resolveConfiguredQrMode } from '../../shared/services/credential-qr.service';
import { Office } from '../database/models';

export class UniFiAccessService {
  private client: UniFiAccessClient;

  constructor() {
    this.client = new UniFiAccessClient();
  }

  public async resolveDoorIds(officeId: number): Promise<string[]> {
    if (!appConfig.unifiAccess.doorMap) {
      return [];
    }

    try {
      const parsed = JSON.parse(appConfig.unifiAccess.doorMap) as Record<string, string[]>;
      // Allow env mappings to key by either office id or the human-readable office name.
      const lookupKeys = await this.resolveOfficeLookupKeys(officeId);

      for (const key of lookupKeys) {
        const candidate = parsed[key];
        if (Array.isArray(candidate)) {
          return candidate;
        }
      }

      return [];
    } catch (error) {
      logger.error({ error }, 'Failed to parse UNIFI_ACCESS_DOOR_MAP');
      return [];
    }
  }

  public async resolveResourceBindings(officeId: number): Promise<UniFiResourceBinding[]> {
    if (!appConfig.unifiAccess.resourceMap) {
      // A plain door-id map is enough for simple deployments; richer resource bindings are optional.
      return (await this.resolveDoorIds(officeId)).map((id) => ({ id, type: 'door' as const }));
    }

    try {
      const parsed = JSON.parse(appConfig.unifiAccess.resourceMap) as Record<string, UniFiResourceBinding[]>;
      const lookupKeys = await this.resolveOfficeLookupKeys(officeId);

      for (const key of lookupKeys) {
        const candidate = parsed[key];
        if (Array.isArray(candidate)) {
          return candidate;
        }
      }

      return [];
    } catch (error) {
      logger.error({ error }, 'Failed to parse UNIFI_ACCESS_RESOURCE_MAP');
      return [];
    }
  }

  public async provisionGuestAccess(input: ProvisionAccessInput): Promise<ProvisionAccessResult> {
    const doorIds = input.doorIds.length > 0 ? input.doorIds : await this.resolveDoorIds(input.officeId);
    const resourceBindings = await this.resolveResourceBindings(input.officeId);
    const qrDeliverySource = resolveConfiguredQrMode();
    const existingVisitorId = input.metadata?.visitor_id as string | undefined;

    if (!this.client.isConfigured) {
      if (appConfig.isProduction) {
        throw new Error('UniFi Access must be configured for production credential provisioning');
      }

      return this.buildInternalFallbackCredential(input, doorIds, {
        fallbackReason: 'unifi_client_not_configured',
        requestedQrDeliverySource: qrDeliverySource,
      });
    }

    let visitorId: string | undefined = existingVisitorId;

    try {
      const [firstName, ...rest] = input.guestName.trim().split(/\s+/);
      const lastName = rest.join(' ') || 'Guest';
      const visitorPayload = {
        first_name: firstName || 'Guest',
        last_name: lastName,
        email: input.guestEmail,
        mobile_phone: input.guestPhone ?? '',
        visitor_company: input.guestCompany ?? '',
        remarks: `GMS visit ${input.visitId}`,
        visit_reason: 'Business',
        start_time: Math.floor(input.validFrom.getTime() / 1000),
        end_time: Math.floor(input.validUntil.getTime() / 1000),
        resources: resourceBindings,
      };

      if (visitorId) {
        await this.client.updateVisitor(visitorId, visitorPayload);
      } else {
        const visitor = await this.client.createVisitor(visitorPayload);
        visitorId = visitor.id;
      }

      if (!visitorId) {
        throw new Error('Failed to resolve visitor ID from UniFi');
      }

      // In production, always let UniFi generate the PIN
      const pinCodeToAssign = (appConfig.isProduction) 
        ? await this.client.generatePinCode() 
        : (input.pinCode || await this.client.generatePinCode());

      await this.client.assignPinCode(visitorId, pinCodeToAssign);
      
      let unifiQrImageDataUri: string | undefined;

      if (qrDeliverySource === 'unifi') {
        // UniFi generates its own QR. We can't push ours.
        await this.client.assignQrCode(visitorId);

        try {
          // Store the UniFi-generated QR image so later email/UI reads do not have to re-fetch it every time.
          const qrPng = await this.client.downloadQrCode(visitorId);
          unifiQrImageDataUri = buildPngDataUri(qrPng);
        } catch (error) {
          logger.warn({ error, visitorId }, 'UniFi visitor QR assigned but image download failed during provisioning');
        }
      }

      return {
        provider: 'UNIFI_ACCESS',
        externalCredentialId: visitorId,
        externalIdentityId: visitorId,
        doorIds,
        metadata: {
          qr_code: input.qrCode,
          pin_code: pinCodeToAssign,
          visitor_id: visitorId,
          resources: resourceBindings,
          qr_delivery_source: qrDeliverySource,
          unifi_qr_assigned: qrDeliverySource === 'unifi',
          unifi_pin_assigned: true,
          ...(unifiQrImageDataUri ? { unifi_qr_image_data_uri: unifiQrImageDataUri } : {}),
        },
      };
    } catch (error) {
      if (!this.shouldFallbackToInternalCredential(error)) {
        throw error;
      }

      logger.warn(
        { error, visitId: input.visitId, visitorId, officeId: input.officeId },
        'UniFi provisioning became unreachable; falling back to an internal credential'
      );

      // Only clean up if we created it in this turn and it failed before completion
      if (visitorId && !existingVisitorId) {
        await this.cleanupPartialVisitor(visitorId);
      }

      return this.buildInternalFallbackCredential(input, doorIds, {
        fallbackReason: this.describeProvisioningError(error),
        requestedQrDeliverySource: qrDeliverySource,
      });
    }
  }

  public async revokeGuestAccess(externalCredentialId: string | null): Promise<void> {
    if (!externalCredentialId || !this.client.isConfigured) {
      return;
    }

    await this.client.unassignQrCode(externalCredentialId);
    await this.client.unassignPinCode(externalCredentialId);
    await this.client.deleteVisitor(externalCredentialId);
  }

  public async updateVisitorValidity(visitorId: string, validUntil: Date): Promise<void> {
    if (!this.client.isConfigured) {
      return;
    }

    await this.client.updateVisitor(visitorId, {
      end_time: Math.floor(validUntil.getTime() / 1000),
    });
  }

  public async fetchRecentSystemLogs(
    topic: 'door_openings' | 'device_events' | 'admin_activity' | 'visitor',
    since: number,
    until: number,
    actorId?: string
  ): Promise<UniFiSystemLogHit[]> {
    if (!this.client.isConfigured) {
      return [];
    }

    const response = await this.client.fetchSystemLogs({
      topic,
      since,
      until,
      ...(actorId ? { actor_id: actorId } : {}),
      page_num: 1,
      page_size: 100,
    });

    return response.hits ?? [];
  }

  public async preparePinCode(requestedPinCode?: string | null): Promise<string> {
    if (!this.client.isConfigured) {
      if (appConfig.isProduction) {
        throw new Error('UniFi Access must be configured for production PIN generation');
      }

      if (requestedPinCode && requestedPinCode.trim()) {
        return requestedPinCode.trim();
      }

      throw new Error('Local PIN generation fallback requires a requested pin code');
    }

    if (appConfig.isProduction) {
      try {
        return await this.client.generatePinCode();
      } catch (error) {
        if (!this.shouldFallbackToInternalCredential(error) || !requestedPinCode?.trim()) {
          throw error;
        }

        logger.warn(
          { error },
          'UniFi PIN generation became unreachable; using the locally generated fallback PIN for this credential'
        );
        return requestedPinCode.trim();
      }
    }

    if (requestedPinCode && requestedPinCode.trim()) {
      return requestedPinCode.trim();
    }

    return this.client.generatePinCode();
  }

  private buildFallbackId(visitId: number, prefix: string) {
    return `${prefix}_${createHash('sha1').update(`${prefix}:${visitId}`).digest('hex').slice(0, 16)}`;
  }

  private buildInternalFallbackCredential(
    input: ProvisionAccessInput,
    doorIds: string[],
    options: {
      fallbackReason: string;
      requestedQrDeliverySource: 'system' | 'unifi';
    }
  ): ProvisionAccessResult {
    return {
      provider: 'INTERNAL',
      externalCredentialId: null,
      externalIdentityId: null,
      doorIds,
      metadata: {
        fallback: true,
        fallback_reason: options.fallbackReason,
        unifi_outage_fallback: true,
        requested_qr_delivery_source: options.requestedQrDeliverySource,
        qr_code: input.qrCode,
        pin_code: input.pinCode ?? null,
        qr_delivery_source: 'system',
      },
    };
  }

  private shouldFallbackToInternalCredential(error: unknown): boolean {
    const visited = new Set<unknown>();
    const queue: unknown[] = [error];
    const codes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EHOSTUNREACH', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT']);
    const messageHints = [
      'fetch failed',
      'network',
      'timed out',
      'timeout',
      'aborted',
      'socket hang up',
      'econnrefused',
      'econnreset',
      'enotfound',
      'ehostunreach',
      'etimedout',
      'service unavailable',
      'bad gateway',
      'gateway timeout',
    ];

    while (queue.length) {
      const current = queue.shift();
      if (!current || visited.has(current)) {
        continue;
      }
      visited.add(current);

      if (typeof current === 'object') {
        const anyError = current as Record<string, unknown>;
        const name = String(anyError.name ?? '').toLowerCase();
        const code = String(anyError.code ?? '').toUpperCase();
        const message = String(anyError.message ?? '').toLowerCase();

        if (name === 'aborterror' || codes.has(code)) {
          return true;
        }

        if (messageHints.some((hint) => message.includes(hint))) {
          return true;
        }

        const statusMatch = /unifi access request failed \((\d{3})\)/i.exec(String(anyError.message ?? ''));
        if (statusMatch && ['502', '503', '504'].includes(statusMatch[1])) {
          return true;
        }

        if ('cause' in anyError) {
          queue.push(anyError.cause);
        }
      }
    }

    return false;
  }

  private describeProvisioningError(error: unknown) {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    return 'unifi_unreachable';
  }

  private async cleanupPartialVisitor(visitorId: string) {
    try {
      await this.client.unassignQrCode(visitorId);
    } catch {}

    try {
      await this.client.unassignPinCode(visitorId);
    } catch {}

    try {
      await this.client.deleteVisitor(visitorId);
    } catch {}
  }

  private async resolveOfficeLookupKeys(officeId: number) {
    const keys = new Set<string>([String(officeId)]);
    const office = await Office.findByPk(officeId, { attributes: ['name'] });
    const officeName = String((office as any)?.name ?? '').trim();

    if (officeName) {
      keys.add(officeName);
      keys.add(officeName.toLowerCase());
    }

    return Array.from(keys);
  }
}
