import { z } from 'zod';

export const revokeCredentialSchema = z.object({
  params: z.object({
    visitId: z.string().regex(/^\d+$/).transform(Number),
  }),
  body: z.object({
    reason: z.string().max(500).optional(),
  }).optional(),
});
