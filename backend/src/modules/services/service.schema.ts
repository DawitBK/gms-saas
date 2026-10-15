import { z } from 'zod';

/**
 * Service Validation Schemas
 */
const hostIds = z
  .array(
    z.preprocess((value) => {
      if (typeof value === 'string' && value.trim() !== '') {
        return Number(value);
      }
      return value;
    }, z.number().int().positive())
  )
  .optional()
  .default([]);

export const createServiceSchema = z.object({
  body: z.object({
    name: z.string()
      .min(2, 'Service name must be at least 2 characters long')
      .max(100, 'Service name is too long'),
    duration_minutes: z.number()
      .int('Duration must be a whole number')
      .positive('Duration must be greater than zero')
      .max(480, 'Service duration cannot exceed 8 hours')
      .optional(),
    department_id: z.number().int().positive('Please select a valid department'),
    office_id: z.number().int().positive('Please select a valid office'),
    host_ids: hostIds,
  }),
});

export const updateServiceSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100).optional(),
    duration_minutes: z.number().int().positive().max(480).optional(),
    department_id: z.number().int().positive().optional(),
    office_id: z.number().int().positive().optional(),
    host_ids: hostIds,
  }).refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  }),
});
