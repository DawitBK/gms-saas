import { apiClient } from '@shared/lib/api-client';
import type { VisitMessage } from './types';

export const visitMessagesApi = {
  async list(visitId: number): Promise<{ success: boolean; data: VisitMessage[] }> {
    const response = await apiClient.get(`/visits/${visitId}/messages`);
    return response.data as { success: boolean; data: VisitMessage[] };
  },

  async send(visitId: number, content: string): Promise<{ success: boolean; data: VisitMessage }> {
    const response = await apiClient.post(`/visits/${visitId}/messages`, { content });
    return response.data as { success: boolean; data: VisitMessage };
  },
};
