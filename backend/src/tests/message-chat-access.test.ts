import { describe, expect, it } from '@jest/globals';
import {
  assertCanAccessVisitChat,
  assertCanPostVisitMessage,
  collectChatRecipientUserIds,
} from '../modules/messages/message.chat-access';
import { AppError } from '../core/errors/AppError';

const baseVisit = {
  id: 1,
  guest_id: 10,
  office_id: 3,
  assigned_host_id: 5 as number | null,
  status: 'PENDING',
};

describe('message.chat-access', () => {
  it('allows super admin regardless of membership', () => {
    expect(() =>
      assertCanAccessVisitChat(999, ['super_admin'], undefined, baseVisit, null)
    ).not.toThrow();
  });

  it('allows the visit guest', () => {
    expect(() => assertCanAccessVisitChat(10, ['guest'], undefined, baseVisit, 20)).not.toThrow();
  });

  it('allows reception in the same office', () => {
    expect(() => assertCanAccessVisitChat(7, ['reception'], 3, baseVisit, 20)).not.toThrow();
  });

  it('denies reception from another office', () => {
    expect(() => assertCanAccessVisitChat(7, ['reception'], 99, baseVisit, 20)).toThrow(AppError);
  });

  it('allows the assigned host user', () => {
    expect(() => assertCanAccessVisitChat(20, ['host'], undefined, baseVisit, 20)).not.toThrow();
  });

  it('denies a host who is not assigned', () => {
    expect(() => assertCanAccessVisitChat(21, ['host'], undefined, baseVisit, 20)).toThrow(AppError);
  });

  it('blocks new messages on terminal visit statuses', () => {
    expect(() => assertCanPostVisitMessage('DECLINED')).toThrow(AppError);
    expect(() => assertCanPostVisitMessage('PENDING')).not.toThrow();
  });

  it('collectChatRecipientUserIds includes guest and host user', () => {
    expect(collectChatRecipientUserIds(10, 20).sort()).toEqual([10, 20]);
    expect(collectChatRecipientUserIds(10, null)).toEqual([10]);
  });
});
