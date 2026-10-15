import { appConfig } from '../../config/app.config';
import { logger } from '../../core/logger/logger';
import { UniFiApiEnvelope, UniFiResourceBinding, UniFiSystemLogHit, UniFiVisitorRecord } from './unifi.types';
import { Agent } from 'undici';

export class UniFiAccessClient {
  private readonly apiPrefix = '/api/v1/developer';
  private readonly baseUrl = appConfig.unifiAccess.baseUrl;
  private readonly apiKey = appConfig.unifiAccess.apiKey;
  private readonly timeoutMs = appConfig.unifiAccess.timeoutMs;
  private readonly maxRetries = appConfig.unifiAccess.maxRetries;

  public get isConfigured() {
    return Boolean(this.baseUrl && this.apiKey);
  }

  public async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  public async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PUT',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  public async get<T>(path: string): Promise<T> {
    return this.request<T>(path, {
      method: 'GET',
    });
  }

  public async delete<T>(path: string): Promise<T> {
    return this.request<T>(path, {
      method: 'DELETE',
    });
  }

  public async createVisitor(body: Record<string, unknown>) {
    return this.post<UniFiVisitorRecord>('/visitors', body);
  }

  public async updateVisitor(id: string, body: Record<string, unknown>) {
    return this.put<UniFiVisitorRecord>(`/visitors/${id}`, body);
  }

  public async deleteVisitor(id: string, isForce = true) {
    return this.delete<null>(`/visitors/${id}${isForce ? '?is_force=true' : ''}`);
  }

  public async assignQrCode(visitorId: string) {
    return this.put<null>(`/visitors/${visitorId}/qr_codes`);
  }

  public async unassignQrCode(visitorId: string) {
    return this.delete<null>(`/visitors/${visitorId}/qr_codes`);
  }

  public async generatePinCode() {
    return this.post<string>('/credentials/pin_codes', {});
  }

  public async assignPinCode(visitorId: string, pinCode: string) {
    return this.put<null>(`/visitors/${visitorId}/pin_codes`, {
      pin_code: pinCode,
    });
  }

  public async unassignPinCode(visitorId: string) {
    return this.delete<null>(`/visitors/${visitorId}/pin_codes`);
  }

  public async fetchDoorGroups() {
    return this.get<Array<{ id: string; name: string; type: string; resources: UniFiResourceBinding[] }>>('/door_groups');
  }

  public async fetchDoors() {
    return this.get<Array<{ id: string; name: string; full_name?: string; type?: string }>>('/doors');
  }

  public async fetchSystemLogs(body: {
    topic: 'door_openings' | 'device_events' | 'admin_activity' | 'visitor';
    since: number;
    until: number;
    actor_id?: string;
    page_num?: number;
    page_size?: number;
  }) {
    const query = new URLSearchParams();
    if (body.page_num) query.set('page_num', String(body.page_num));
    if (body.page_size) query.set('page_size', String(body.page_size));

    const path = `/system/logs${query.toString() ? `?${query.toString()}` : ''}`;
    return this.post<{ hits: UniFiSystemLogHit[] }> (path, {
      topic: body.topic,
      since: body.since,
      until: body.until,
      ...(body.actor_id ? { actor_id: body.actor_id } : {}),
    });
  }

  public async unlockDoor(doorId: string) {
    return this.put<null>(`/doors/${doorId}/unlock`);
  }

  public async downloadQrCode(visitorId: string): Promise<ArrayBuffer> {
    return this.requestBinary(`/credentials/qr_codes/download/${visitorId}`, {
      method: 'GET',
    });
  }

  public async registerWebhook(url: string, topics: string[] = ['visitor', 'door_openings']) {
    return this.post<{ id: string }>('/webhooks', {
      url,
      topics,
      event_type: 'all'
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    if (!this.baseUrl || !this.apiKey) {
      throw new Error('UniFi Access client is not configured');
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const insecureTlsDispatcher =
          // Local-prod environments may still require explicit self-signed cert bypass.
          !appConfig.unifiAccess.tlsRejectUnauthorized &&
          this.baseUrl.startsWith('https://')
            ? new Agent({ connect: { rejectUnauthorized: false } })
            : undefined;

        const response = await fetch(`${this.baseUrl}${this.apiPrefix}${path}`, {
          ...init,
          signal: controller.signal,
          ...(insecureTlsDispatcher ? { dispatcher: insecureTlsDispatcher } : {}),
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            ...(init.headers ?? {}),
          },
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const message = await response.text();
          throw new Error(`UniFi Access request failed (${response.status}): ${message}`);
        }

        const responseBody = (await response.json()) as UniFiApiEnvelope<T> | T;
        if (
          responseBody &&
          typeof responseBody === 'object' &&
          'code' in (responseBody as UniFiApiEnvelope<T>) &&
          'data' in (responseBody as UniFiApiEnvelope<T>)
        ) {
          return (responseBody as UniFiApiEnvelope<T>).data;
        }

        return responseBody as T;
      } catch (error) {
        clearTimeout(timeout);
        lastError = error;
        logger.warn({ error, attempt, path }, 'UniFi Access request failed, retrying if allowed');
      }
    }

    throw lastError instanceof Error ? lastError : new Error('UniFi Access request failed');
  }

  private async requestBinary(path: string, init: RequestInit): Promise<ArrayBuffer> {
    if (!this.baseUrl || !this.apiKey) {
      throw new Error('UniFi Access client is not configured');
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const insecureTlsDispatcher =
          // Keep binary QR fetches aligned with the same TLS expectations as JSON API requests.
          !appConfig.unifiAccess.tlsRejectUnauthorized &&
          this.baseUrl.startsWith('https://')
            ? new Agent({ connect: { rejectUnauthorized: false } })
            : undefined;

        const response = await fetch(`${this.baseUrl}${this.apiPrefix}${path}`, {
          ...init,
          signal: controller.signal,
          ...(insecureTlsDispatcher ? { dispatcher: insecureTlsDispatcher } : {}),
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            ...(init.headers ?? {}),
          },
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const message = await response.text();
          throw new Error(`UniFi Access request failed (${response.status}): ${message}`);
        }

        return await response.arrayBuffer();
      } catch (error) {
        clearTimeout(timeout);
        lastError = error;
        logger.warn({ error, attempt, path }, 'UniFi Access binary request failed, retrying if allowed');
      }
    }

    throw lastError instanceof Error ? lastError : new Error('UniFi Access binary request failed');
  }
}
