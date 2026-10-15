import { z } from 'zod';

const simpleWebhookSchema = z.object({
  event_id: z.string().min(1),
  event_type: z.string().min(1),
  occurred_at: z.string().datetime().optional(),
  credential_id: z.string().optional(),
  identity_id: z.string().optional(),
  qr_code: z.string().optional(),
  visit_id: z.number().int().positive().optional(),
  office_id: z.number().int().positive().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const systemLogSchema = z
  .object({
    topic: z.enum(['door_openings', 'device_events', 'admin_activity', 'visitor']).optional(),
    '@timestamp': z.string().optional(),
    _id: z.string().optional(),
    _source: z
      .object({
        actor: z
          .object({
            id: z.string().optional(),
            type: z.string().optional(),
            display_name: z.string().optional(),
            alternate_id: z.string().optional(),
            alternate_name: z.string().optional(),
          })
          .optional(),
        authentication: z
          .object({
            credential_provider: z.string().optional(),
            issuer: z.string().optional(),
          })
          .optional(),
        event: z
          .object({
            display_message: z.string().optional(),
            published: z.number().optional(),
            reason: z.string().optional(),
            result: z.string().optional(),
            type: z.string().optional(),
          })
          .optional(),
        target: z
          .array(
            z.object({
              id: z.string().optional(),
              type: z.string().optional(),
              display_name: z.string().optional(),
              alternate_id: z.string().optional(),
              alternate_name: z.string().optional(),
            })
          )
          .optional(),
        tag: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

const officialWebhookSchema = z
  .object({
    event: z.string().min(1),
    event_object_id: z.string().min(1),
    data: z
      .object({
        location: z
          .object({
            id: z.string().optional(),
            location_type: z.string().optional(),
            name: z.string().optional(),
            up_id: z.string().optional(),
            extras: z.record(z.string(), z.any()).optional(),
            device_ids: z.any().optional(),
          })
          .optional(),
        device: z
          .object({
            id: z.string().optional(),
            name: z.string().optional(),
            alias: z.string().optional(),
            device_type: z.string().optional(),
          })
          .nullable()
          .optional(),
        actor: z
          .object({
            id: z.string().optional(),
            name: z.string().optional(),
            type: z.string().optional(),
          })
          .nullable()
          .optional(),
        object: z.record(z.string(), z.any()).optional(),
      })
      .passthrough(),
  })
  .passthrough();

export const unifiWebhookSchema = z.object({
  body: z.union([simpleWebhookSchema, systemLogSchema, officialWebhookSchema]),
});
