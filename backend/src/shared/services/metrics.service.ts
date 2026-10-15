import client from 'prom-client';
import { appConfig } from '../../config/app.config';
import { queues } from '../../infrastructure/queue/queue';

export const metricsRegistry = new client.Registry();

if (appConfig.observability.metricsEnabled) {
  client.collectDefaultMetrics({ register: metricsRegistry });
}

export const httpRequestCounter = new client.Counter({
  name: 'gms_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: 'gms_http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

export const jobDurationSeconds = new client.Histogram({
  name: 'gms_job_duration_seconds',
  help: 'Queue job duration in seconds',
  labelNames: ['queue', 'job_name', 'status'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10],
  registers: [metricsRegistry],
});

export const jobFailuresCounter = new client.Counter({
  name: 'gms_job_failures_total',
  help: 'Total failed jobs',
  labelNames: ['queue', 'job_name'],
  registers: [metricsRegistry],
});

export const queueDepthGauge = new client.Gauge({
  name: 'gms_queue_depth',
  help: 'Current BullMQ queue depth by status',
  labelNames: ['queue', 'state'],
  registers: [metricsRegistry],
  async collect() {
    await Promise.all(
      Object.entries(queues).map(async ([queueName, queue]) => {
        const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
        this.set({ queue: queueName, state: 'waiting' }, counts.waiting ?? 0);
        this.set({ queue: queueName, state: 'active' }, counts.active ?? 0);
        this.set({ queue: queueName, state: 'completed' }, counts.completed ?? 0);
        this.set({ queue: queueName, state: 'failed' }, counts.failed ?? 0);
        this.set({ queue: queueName, state: 'delayed' }, counts.delayed ?? 0);
      })
    );
  },
});
