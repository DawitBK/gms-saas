import { z } from 'zod';
import { normalizeRoles } from '../../shared/auth/roles';

const rolesField = z
  .array(z.string())
  .min(1, 'At least one role is required')
  .superRefine((roles, ctx) => {
    const normalizedRoles = normalizeRoles(roles);
    if (normalizedRoles.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one valid role is required.',
      });
    }
  });

export const setRolesSchema = z.object({
  body: z.object({
    roles: rolesField
  })
});

export const createUserSchema = z.object({
  body: z.object({
    // full_name: z.string().min(2, 'Name required'),
    full_name: z.string().min(2, 'Name required').optional().or(z.literal('')),
    email: z.string().email('Invalid email structure'),
    phone: z.string().min(8, 'Phone number must be at least 8 characters').optional().or(z.literal('')),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    roles: rolesField,
    office_id: z.number().int().positive().nullable().optional(),
    department_id: z.number().int().positive().nullable().optional(),
    service_ids: z.array(z.coerce.number().int().nonnegative()).optional(),
    replace_service_assignments: z.boolean().optional(),
    active: z.boolean().optional(),
  })
});

export const updateUserSchema = z.object({
  body: z.object({
    full_name: z.string().min(2, 'Name required').optional(),
    email: z.string().email('Invalid email structure').optional(),
    phone: z.string().min(8, 'Phone number must be at least 8 characters').optional().or(z.literal('')),
    password: z.string().min(6, 'Password must be at least 6 characters').optional(),
    roles: rolesField.optional(),
    office_id: z.number().int().positive().nullable().optional(),
    department_id: z.number().int().positive().nullable().optional(),
    service_ids: z.array(z.coerce.number().int().nonnegative()).optional(),
    replace_service_assignments: z.boolean().optional(),
    active: z.boolean().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  }).refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  }),
});
