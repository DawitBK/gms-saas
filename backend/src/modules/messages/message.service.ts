import { Message, User, Visit } from '../../infrastructure/database/models';
import { AppError } from '../../core/errors/AppError';
import { ErrorCodes } from '../../core/errors/errorCodes';
import { EventBus } from '../../infrastructure/events/eventBus';
import { EventTypes } from '../../infrastructure/events/eventTypes';
import * as chatAccess from './message.chat-access';

export type MessageDTO = {
  id: number;
  visit_id: number;
  sender_id: number;
  content: string;
  created_at: Date;
  sender: { id: number; full_name: string | null; email: string | null };
};

function mapMessage(row: Message & { sender?: User }): MessageDTO {
  const s = row.sender as User | undefined;
  return {
    id: Number(row.id),
    visit_id: Number(row.visit_id),
    sender_id: Number(row.sender_id),
    content: String(row.content),
    created_at: row.created_at,
    sender: {
      id: s ? Number(s.id) : Number(row.sender_id),
      full_name: s ? (s.full_name ?? null) : null,
      email: s ? (s.email ?? null) : null,
    },
  };
}

export async function listMessagesForVisitActor(
  visitId: number,
  user: { id: number; office_id?: number },
  roles: string[]
): Promise<MessageDTO[]> {
  const visit = await Visit.findByPk(visitId, {
    attributes: ['id', 'guest_id', 'office_id', 'assigned_host_id', 'status'],
  });
  if (!visit) {
    throw new AppError('Visit not found', ErrorCodes.SYSTEM_NOT_FOUND, 404);
  }

  const v = visit.toJSON() as chatAccess.VisitChatRow;
  const hostUserId = await chatAccess.loadHostUserId(v.assigned_host_id);
  chatAccess.assertCanAccessVisitChat(user.id, roles, user.office_id, v, hostUserId);

  const rows = await Message.findAll({
    where: { visit_id: visitId },
    order: [['created_at', 'ASC']],
    include: [{ model: User, as: 'sender', attributes: ['id', 'full_name', 'email'] }],
  });

  return rows.map((r) => mapMessage(r as Message & { sender?: User }));
}

export async function postMessageForVisitActor(
  visitId: number,
  user: { id: number; office_id?: number },
  roles: string[],
  content: string
): Promise<MessageDTO> {
  const visit = await Visit.findByPk(visitId, {
    attributes: ['id', 'guest_id', 'office_id', 'assigned_host_id', 'status'],
  });
  if (!visit) {
    throw new AppError('Visit not found', ErrorCodes.SYSTEM_NOT_FOUND, 404);
  }

  const v = visit.toJSON() as chatAccess.VisitChatRow;
  const hostUserId = await chatAccess.loadHostUserId(v.assigned_host_id);
  chatAccess.assertCanAccessVisitChat(user.id, roles, user.office_id, v, hostUserId);
  chatAccess.assertCanPostVisitMessage(String(v.status));

  const row = await Message.create({
    visit_id: visitId,
    sender_id: user.id,
    content,
  });

  const withSender = await Message.findByPk(row.id, {
    include: [{ model: User, as: 'sender', attributes: ['id', 'full_name', 'email'] }],
  });

  const dto = mapMessage(withSender as Message & { sender?: User });
  const recipients = chatAccess.collectChatRecipientUserIds(Number(v.guest_id), hostUserId);

  EventBus.emitEvent({
    type: EventTypes.MESSAGE_SENT,
    metadata: {
      entity_id: visitId,
      visit_id: visitId,
      office_id: v.office_id,
      actor_id: user.id,
      timestamp: new Date(),
      recipient_user_ids: recipients,
      after: dto,
    },
  });

  return dto;
}
