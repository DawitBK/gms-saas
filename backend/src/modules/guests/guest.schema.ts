import { z } from "zod";

const nullableShortString = z.string().trim().max(255).optional().nullable();

const guestProfileUpdateBodySchema = z.object({
  body: z.object({
    company: nullableShortString,
    government_id: nullableShortString,
    notes: z.string().trim().max(2000).optional().nullable(),
    emergency_contact_name: nullableShortString,
    emergency_contact_phone: nullableShortString,
    preferred_notification_channel: z.enum(["EMAIL", "SMS", "BOTH"]).optional(),
  }),
});

export const updateOwnGuestProfileSchema = guestProfileUpdateBodySchema;

export const updateManagedGuestProfileSchema = z.object({
  body: guestProfileUpdateBodySchema.shape.body.extend({
    is_vip: z.boolean().optional(),
  }),
});
