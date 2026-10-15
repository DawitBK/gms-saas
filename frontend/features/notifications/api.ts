import { apiClient } from '@shared/lib/api-client';
import type { NotificationItem } from './types';

export interface NotificationsPage {
  success: boolean;
  data: NotificationItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export const notificationsApi = {
  async list() {
    const response = await apiClient.get('/notifications');
    return response.data.data as NotificationItem[];
  },

  // Paginated variant for the notification-center pages (15/page). The bare
  // list() above stays as-is for the bell/dashboard-widget consumers, which
  // only ever want the backend's default first page anyway.
  async listPage(params: { page: number; limit: number }): Promise<NotificationsPage> {
    const response = await apiClient.get('/notifications', { params });
    return response.data as NotificationsPage;
  },

  async markAllRead() {
    const response = await apiClient.post('/notifications/read-all');
    return response.data.data as NotificationItem[];
  },

  async markRead(id: number) {
    const response = await apiClient.post(`/notifications/${id}/read`);
    return response.data.data as NotificationItem;
  },
};
