import { z } from 'zod';

const timeField = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use HH:MM or HH:MM:SS');
const intFromInput = z.coerce.number().int().positive();
const weekdayFromInput = z.coerce.number().int().min(0).max(6);
const monthDayFromInput = z.coerce.number().int().min(1).max(31);
const horizonFromInput = z.coerce.number().int().min(1).max(120);

export const availabilityRuleSchema = z.object({
  body: z.object({
    host_id: intFromInput.optional(),
    office_id: intFromInput.optional(),
    recurrence_type: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'DATE_OVERRIDE']),
    day_of_week: weekdayFromInput.optional(),
    day_of_month: monthDayFromInput.optional(),
    specific_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    start_time: timeField,
    end_time: timeField,
    is_available: z.boolean().optional(),
    label: z.string().max(120).optional(),
    notes: z.string().max(500).optional(),
    horizon_days: horizonFromInput.optional(),
  }),
});

export const updateAvailabilityRuleSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
  body: availabilityRuleSchema.shape.body.partial(),
});

export const availabilityRuleParamsSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
});

export const listTimeSlotsQuerySchema = z.object({
  query: z.object({
    office_id: intFromInput.optional(),
    service_id: intFromInput.optional(),
    department_id: intFromInput.optional(),
    host_id: intFromInput.optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }).passthrough(),
});

export const hostBoardQuerySchema = z.object({
  query: z.object({
    host_id: intFromInput.optional(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }).passthrough(),
});
