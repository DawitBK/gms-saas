export const VISIT_LIFECYCLE_STATUSES = [
  "PENDING",
  "APPROVED",
  "DECLINED",
  "RESCHEDULED",
  "REASSIGNED",
  "REASSIGNED_RESCHEDULED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
  "ESCALATED",
  "EXPIRED",
] as const;
export const VISIT_STATUS_PENDING = "PENDING" as const;
export const VISIT_STATUS_APPROVED = "APPROVED" as const;
export const VISIT_STATUS_DECLINED = "DECLINED" as const;
export const VISIT_STATUS_RESCHEDULED = "RESCHEDULED" as const;
export const VISIT_STATUS_CHECKED_IN = "CHECKED_IN" as const;
export const VISIT_STATUS_IN_PROGRESS = "IN_PROGRESS" as const;
export const VISIT_STATUS_COMPLETED = "COMPLETED" as const;
export const VISIT_STATUS_CANCELLED = "CANCELLED" as const;
export const VISIT_STATUS_NO_SHOW = "NO_SHOW" as const;
export const VISIT_STATUS_ESCALATED = "ESCALATED" as const;
export const VISIT_STATUS_EXPIRED = "EXPIRED" as const;
export const VISIT_STATUS_REASSIGNED = "REASSIGNED" as const;
export const VISIT_STATUS_REASSIGNED_RESCHEDULED = "REASSIGNED_RESCHEDULED" as const;

export const LEGACY_VISIT_LIFECYCLE_STATUSES = ["RECEIVED"] as const;

export const STORED_VISIT_LIFECYCLE_STATUSES = [
  ...VISIT_LIFECYCLE_STATUSES,
  ...LEGACY_VISIT_LIFECYCLE_STATUSES,
] as const;

export const VISIT_GUEST_DECISION_STATUSES = [
  "PENDING_GUEST",
  "ACCEPTED",
  "DECLINED",
] as const;
export const VISIT_GUEST_DECISION_PENDING = "PENDING_GUEST" as const;
export const VISIT_GUEST_DECISION_ACCEPTED = "ACCEPTED" as const;
export const VISIT_GUEST_DECISION_DECLINED = "DECLINED" as const;

export const APPROVAL_DECISION_STATUSES = ["APPROVED", "DECLINED"] as const;
export const LEGACY_APPROVAL_DECISION_STATUSES = ["REVOKED"] as const;
export const APPROVAL_DECISION_APPROVED = "APPROVED" as const;
export const APPROVAL_DECISION_DECLINED = "DECLINED" as const;
export const APPROVAL_DECISION_REVOKED = "REVOKED" as const;
export const APPROVAL_STATUSES = [
  ...APPROVAL_DECISION_STATUSES,
  ...LEGACY_APPROVAL_DECISION_STATUSES,
] as const;

export const CREDENTIAL_LIFECYCLE_STATUSES = [
  "PENDING",
  "ACTIVE",
  "REVOKED",
  "EXPIRED",
  "FAILED",
] as const;
export const CREDENTIAL_STATUS_PENDING = "PENDING" as const;
export const CREDENTIAL_STATUS_ACTIVE = "ACTIVE" as const;
export const CREDENTIAL_STATUS_REVOKED = "REVOKED" as const;
export const CREDENTIAL_STATUS_EXPIRED = "EXPIRED" as const;
export const CREDENTIAL_STATUS_FAILED = "FAILED" as const;

export const USER_ACCOUNT_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING_VERIFICATION"] as const;
export const USER_PRESENCE_STATUSES = ["ONLINE", "OFFLINE", "BUSY"] as const;
export const USER_ACCOUNT_STATUS_ACTIVE = "ACTIVE" as const;
export const USER_ACCOUNT_STATUS_INACTIVE = "INACTIVE" as const;
export const USER_ACCOUNT_STATUS_SUSPENDED = "SUSPENDED" as const;
export const USER_ACCOUNT_STATUS_PENDING_VERIFICATION = "PENDING_VERIFICATION" as const;
export const USER_PRESENCE_STATUS_ONLINE = "ONLINE" as const;
export const USER_PRESENCE_STATUS_OFFLINE = "OFFLINE" as const;
export const USER_PRESENCE_STATUS_BUSY = "BUSY" as const;

export const OUTBOX_PROCESSING_STATUSES = [
  "PENDING",
  "PROCESSING",
  "PROCESSED",
  "FAILED",
  "DEAD_LETTER",
] as const;
export const OUTBOX_STATUS_PENDING = "PENDING" as const;
export const OUTBOX_STATUS_PROCESSING = "PROCESSING" as const;
export const OUTBOX_STATUS_PROCESSED = "PROCESSED" as const;
export const OUTBOX_STATUS_FAILED = "FAILED" as const;
export const OUTBOX_STATUS_DEAD_LETTER = "DEAD_LETTER" as const;

export const WEBHOOK_INGESTION_STATUSES = [
  "RECEIVED",
  "PROCESSED",
  "FAILED",
  "IGNORED",
] as const;
export const WEBHOOK_STATUS_RECEIVED = "RECEIVED" as const;
export const WEBHOOK_STATUS_PROCESSED = "PROCESSED" as const;
export const WEBHOOK_STATUS_FAILED = "FAILED" as const;
export const WEBHOOK_STATUS_IGNORED = "IGNORED" as const;

export const TIMESLOT_STATE_STATUSES = ["AVAILABLE", "BOOKED", "BLOCKED"] as const;
export const TIMESLOT_STATE_AVAILABLE = "AVAILABLE" as const;
export const TIMESLOT_STATE_BOOKED = "BOOKED" as const;
export const TIMESLOT_STATE_BLOCKED = "BLOCKED" as const;

export const TERMINAL_VISIT_LIFECYCLE_STATUSES = [
  "CANCELLED",
  "DECLINED",
  "COMPLETED",
  "EXPIRED",
  "NO_SHOW",
] as const;

export const NON_OCCUPYING_VISIT_LIFECYCLE_STATUSES = [
  ...TERMINAL_VISIT_LIFECYCLE_STATUSES,
] as const;

export const NON_OCCUPYING_VISIT_STATUSES =
  NON_OCCUPYING_VISIT_LIFECYCLE_STATUSES;

export const ACTIVE_CREDENTIAL_LIFECYCLE_STATUSES = ["PENDING", "ACTIVE"] as const;

export const STATUS_CATALOG = {
  visit: {
    lifecycle: VISIT_LIFECYCLE_STATUSES,
    guest_decision: VISIT_GUEST_DECISION_STATUSES,
  },
  approval: {
    decision: APPROVAL_DECISION_STATUSES,
  },
  credential: {
    lifecycle: CREDENTIAL_LIFECYCLE_STATUSES,
  },
  user: {
    account: USER_ACCOUNT_STATUSES,
    presence: USER_PRESENCE_STATUSES,
  },
  outbox: {
    processing: OUTBOX_PROCESSING_STATUSES,
  },
  webhook: {
    ingestion: WEBHOOK_INGESTION_STATUSES,
  },
  timeslot: {
    state: TIMESLOT_STATE_STATUSES,
  },
} as const;

export const STATUS_GROUPS = {
  terminal: {
    visit_lifecycle: TERMINAL_VISIT_LIFECYCLE_STATUSES,
  },
  non_occupying: {
    visit_lifecycle: NON_OCCUPYING_VISIT_LIFECYCLE_STATUSES,
  },
  active: {
    credential_lifecycle: ACTIVE_CREDENTIAL_LIFECYCLE_STATUSES,
  },
  legacy_aliases: {
    visit_lifecycle: LEGACY_VISIT_LIFECYCLE_STATUSES,
    approval_decision: LEGACY_APPROVAL_DECISION_STATUSES,
  },
} as const;

export type VisitLifecycleStatus = (typeof VISIT_LIFECYCLE_STATUSES)[number];
export type StoredVisitLifecycleStatus = (typeof STORED_VISIT_LIFECYCLE_STATUSES)[number];
export type VisitGuestDecisionStatus = (typeof VISIT_GUEST_DECISION_STATUSES)[number];
export type ApprovalDecisionStatus = (typeof APPROVAL_DECISION_STATUSES)[number];
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export type CredentialLifecycleStatus = (typeof CREDENTIAL_LIFECYCLE_STATUSES)[number];
export type UserAccountStatus = (typeof USER_ACCOUNT_STATUSES)[number];
export type UserPresenceStatus = (typeof USER_PRESENCE_STATUSES)[number];
export type OutboxProcessingStatus = (typeof OUTBOX_PROCESSING_STATUSES)[number];
export type WebhookIngestionStatus = (typeof WEBHOOK_INGESTION_STATUSES)[number];
export type TimeSlotStateStatus = (typeof TIMESLOT_STATE_STATUSES)[number];

// Compatibility exports used by existing modules.
export const CREDENTIAL_STATUSES = CREDENTIAL_LIFECYCLE_STATUSES;
export const ACTIVE_CREDENTIAL_STATUSES = ACTIVE_CREDENTIAL_LIFECYCLE_STATUSES;
export type CredentialStatus = CredentialLifecycleStatus;
