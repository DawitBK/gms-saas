import { z } from 'zod';

/**
 * Department Validation Schemas
 */
export const createDepartmentSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Department name must be at least 2 characters long').max(100, 'Department name is too long'),
    office_id: z.number().int().positive('Please select a valid office'),
    description: z.string().optional(),
  }),
});

export const updateDepartmentSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100).optional(),
    description: z.string().optional(),
  }),
});
