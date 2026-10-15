import { z } from 'zod';

export const postVisitMessageSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
  body: z.object({
    content: z.string().trim().min(1).max(8000),
  }),
});
