import { z } from 'zod';
import { OPERATOR_VISIT_STATUSES } from './visit-statuses';
import {
  VISIT_GUEST_DECISION_ACCEPTED,
  VISIT_GUEST_DECISION_DECLINED,
} from '../../core/status/status-catalog';
import { collectionQueryFields, normalizeCollectionQuery } from '../../core/utils/shared.schema';

const optionalPositiveInt = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }
  return Number(value);
}, z.number().int().positive().optional());

const nullableOptionalPositiveInt = z.preprocess((value) => {
  if (value === '' || value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return Number(value);
}, z.number().int().positive().nullable().optional());

export const createVisitSchema = z.object({
  body: z.object({
    service_id: nullableOptionalPositiveInt,
    department_id: nullableOptionalPositiveInt,
    office_id: z.coerce.number().int().positive(),
    time_slot_id: z.coerce.number().int().positive(),
    host_id: optionalPositiveInt,
    guest_id: optionalPositiveInt,
    guest_payload: z.object({
      full_name: z.string().min(2),
      email: z.string().email(),
      phone: z.string().optional(),
      company: z.string().optional(),
    }).optional(),
    purpose: z.string().optional()
  })
});

export const updateVisitStatusSchema = z.object({
  body: z.object({
    status: z.enum(OPERATOR_VISIT_STATUSES)
  }),
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number)
  })
});

export const rescheduleVisitSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
  body: z.object({
    time_slot_id: z.coerce.number().int().positive(),
    note: z.string().max(500).optional(),
  }),
});

export const reassignVisitSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
  body: z.object({
    host_id: z.coerce.number().int().positive(),
    time_slot_id: optionalPositiveInt,
    note: z.string().max(500).optional(),
  }),
});

export const escalateVisitSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
  body: z.object({
    reason: z.string().max(500).optional(),
  }),
});

export const guestDecisionSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
  body: z.object({
    decision: z.enum([VISIT_GUEST_DECISION_ACCEPTED, VISIT_GUEST_DECISION_DECLINED]),
  }),
});

/**
 * Was `collectionQuerySchema.merge(z.object({ query: ... }))`. Both sides
 * define `query`, and merge is shallow — so the shared shape was REPLACED,
 * not combined, and every field it validates (page, limit, office_id,
 * department_id, sort_by, sort_order, the alias handling and the page/limit
 * defaults) stopped being checked on `GET /visits`. `.passthrough()` then let
 * them through raw: `?office_id=abc` reached Postgres as the string "abc" and
 * came back as an unhandled 500, since errorHandler has no
 * SequelizeDatabaseError branch.
 *
 * `.extend()` on the shared field shape composes both, which is what the
 * `.merge()` was reaching for.
 */
export const listVisitsQuerySchema = z.object({
  query: collectionQueryFields
    .extend({
      id: optionalPositiveInt,
      guest_id: optionalPositiveInt,
      host_id: optionalPositiveInt,
      date: z.string().optional(),
      has_credential: z.enum(["true", "false"]).optional(),
      has_host: z.enum(["true", "false"]).optional(),
      expiring_soon: z.enum(["true", "false"]).optional(),
      status_group: z.string().optional(),
      statusGroup: z.string().optional(),
      hasCredential: z.enum(["true", "false"]).optional(),
      expiringSoon: z.enum(["true", "false"]).optional(),
    })
    .passthrough()
    .transform((query) => ({
      ...normalizeCollectionQuery(query),
      status_group: query.status_group ?? query.statusGroup,
      has_credential: query.has_credential ?? query.hasCredential,
      expiring_soon: query.expiring_soon ?? query.expiringSoon,
    })),
});

export const extendVisitSchema = z.object({
  body: z.object({
    new_end_time: z.string()
  })
});

export const submitFeedbackSchema = z.object({
  body: z.object({
    rating: z.coerce.number().int().min(1, 'Rating must be between 1 and 5').max(5, 'Rating must be between 1 and 5'),
    comment: z.string().max(1000).optional()
  })
});
