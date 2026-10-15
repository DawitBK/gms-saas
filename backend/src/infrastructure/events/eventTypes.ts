export enum EventTypes {
  VISIT_CREATED = 'VISIT.CREATED',
  VISIT_APPROVED = 'VISIT.APPROVED',
  VISIT_CHECKED_IN = 'VISIT.CHECKED_IN',
  VISIT_CANCELLED = 'VISIT.CANCELLED',
  VISIT_DECLINED = 'VISIT.DECLINED',
  VISIT_COMPLETED = 'VISIT.COMPLETED',
  SLOT_LOCKED = 'SLOT.LOCKED',
  NOTIFICATION_CREATED = 'NOTIFICATION.CREATED',
  MESSAGE_SENT = 'MESSAGE.SENT',
  USER_LOGGED_IN = 'USER.LOGGED_IN',
  USER_REGISTERED = 'USER.REGISTERED',
  ROLE_CHANGED = 'ROLE.CHANGED',
  VISIT_RESCHEDULED = 'VISIT.RESCHEDULED',
  VISIT_REASSIGNED = 'VISIT.REASSIGNED',
  VISIT_ESCALATED = 'VISIT.ESCALATED',
  VISIT_NO_SHOW = 'VISIT.NO_SHOW',
  VISIT_SLA_ESCALATED = 'VISIT.SLA_ESCALATED',
  VISIT_GUEST_DECISION = 'VISIT.GUEST_DECISION',
  VISIT_CREDENTIAL_ACTIVE = 'VISIT.CREDENTIAL_ACTIVE'
}

export interface EnterpriseEventPayload {
  type: EventTypes;
  metadata: {
    entity_id: number | string;
    office_id?: number | string;
    actor_id?: number | string;
    timestamp: Date;
    before?: any;
    after?: any;
    /** Visit-scoped chat: room id and websocket fan-out targets */
    visit_id?: number;
    recipient_user_ids?: number[];
    waiting_since?: Date;
  };
}
