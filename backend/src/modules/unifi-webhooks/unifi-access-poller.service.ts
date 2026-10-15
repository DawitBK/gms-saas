import { UniFiAccessClient } from '../../infrastructure/unifi/unifi.client';
import { UniFiSystemLogHit } from '../../infrastructure/unifi/unifi.types';
import { logger } from '../../core/logger/logger';
import { captureException } from '../../shared/services/sentry.service';
import { UniFiWebhookRepository } from './unifi-webhook.repository';
import { UniFiWebhookService } from './unifi-webhook.service';

/**
 * Polls UniFi Access system logs and feeds matching events into the existing
 * UniFi event-processing pipeline when webhook delivery is unavailable.
 */
export class UniFiAccessPollerService {
  private client: UniFiAccessClient;
  private webhookService: UniFiWebhookService;
  private repository: UniFiWebhookRepository;
  private intervalHandle: ReturnType<typeof setTimeout> | null = null;
  // Per-topic, not shared: a topic whose fetch fails must keep its own old
  // watermark so the next cycle re-covers the gap instead of silently
  // skipping straight to "now" — see the success check in poll() below.
  private lastPollTimestamps: Record<'door_openings' | 'visitor', number>;
  private isPolling = false;
  private readonly POLL_TOPICS = ['door_openings', 'visitor'] as const;

  constructor(private readonly pollIntervalMs: number = 15000) {
    this.client = new UniFiAccessClient();
    this.webhookService = new UniFiWebhookService();
    this.repository = new UniFiWebhookRepository();
    // Look back briefly on boot so we do not miss events around process start.
    const bootWatermark = Math.floor(Date.now() / 1000) - 60;
    this.lastPollTimestamps = { door_openings: bootWatermark, visitor: bootWatermark };
  }

  public start(): void {
    if (!this.client.isConfigured) {
      logger.info({ module: 'unifi-poller' }, 'UniFi Access is not configured - polling disabled');
      return;
    }

    if (this.intervalHandle) {
      logger.warn({ module: 'unifi-poller' }, 'Poller already running - ignoring duplicate start');
      return;
    }

    logger.info({ module: 'unifi-poller', intervalMs: this.pollIntervalMs }, 'UniFi Access log poller started (Resilient Mode)');
    this.intervalHandle = setTimeout(() => void this.poll(), 0);
  }

  public stop(): void {
    if (!this.intervalHandle) {
      return;
    }

    clearTimeout(this.intervalHandle);
    this.intervalHandle = null;
    logger.info({ module: 'unifi-poller' }, 'UniFi Access log poller stopped');
  }

  private async poll(): Promise<void> {
    if (this.isPolling) {
      return;
    }

    this.isPolling = true;
    const now = Math.floor(Date.now() / 1000);

    try {
      for (const topic of this.POLL_TOPICS) {
        const succeeded = await this.pollTopic(topic, this.lastPollTimestamps[topic], now);
        // Only this topic's watermark advances, and only on success — a
        // failed fetch keeps the old timestamp so the next cycle's range
        // still covers whatever window this attempt missed.
        if (succeeded) this.lastPollTimestamps[topic] = now;
      }
    } catch (error) {
      logger.error({ err: error, module: 'unifi-poller', action: 'poll' }, 'UniFi Access poll cycle failed');
      captureException(error, { module: 'unifi-poller', action: 'poll' });
    } finally {
      this.isPolling = false;
      if (this.intervalHandle) {
        this.intervalHandle = setTimeout(() => void this.poll(), this.pollIntervalMs);
      }
    }
  }

  private async pollTopic(topic: 'door_openings' | 'visitor', since: number, until: number): Promise<boolean> {
    try {
      const result = await this.client.fetchSystemLogs({
        topic,
        since,
        until,
        page_num: 1,
        page_size: 100,
      });

      const hits = result?.hits ?? [];
      if (hits.length > 0) {
        logger.debug({ module: 'unifi-poller', topic, count: hits.length }, `Polled ${hits.length} new ${topic} events`);

        for (const hit of hits) {
          await this.processLogHit(hit, topic);
        }
      }

      return true;
    } catch (error) {
      logger.warn({ err: error, module: 'unifi-poller', topic }, `Failed to poll UniFi topic: ${topic}`);
      return false;
    }
  }

  private async processLogHit(hit: UniFiSystemLogHit, topic: 'door_openings' | 'visitor'): Promise<void> {
    const eventId =
      hit._id ?? `poll:${topic}:${hit._source?.event?.published ?? Date.now()}:${hit._source?.actor?.id ?? 'unknown'}`;

    const existing = await this.repository.findEvent('UNIFI_ACCESS', eventId);
    if (existing) {
      return;
    }

    try {
      await this.webhookService.processPolledEvent({
        topic,
        '@timestamp': hit['@timestamp'],
        _id: eventId,
        _source: hit._source,
      });

      logger.debug({ module: 'unifi-poller', eventId, topic }, 'Polled event processed successfully');
    } catch (error) {
      logger.warn({ err: error, module: 'unifi-poller', eventId, topic }, 'Failed to process polled event');
    }
  }
}
