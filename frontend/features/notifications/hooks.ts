import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from './api';
import { useRoleContext } from '@shared/hooks/useRoleContext';
import { QC } from '@shared/lib/query-config';

export const useNotifications = () => {
  const { scopeKey } = useRoleContext();

  return useQuery({
    queryKey: ['notifications', scopeKey],
    queryFn: () => notificationsApi.list(),
    ...QC.NOTIFICATIONS,
  });
};

// Paginated variant for the notification-center pages (15/page) - the plain
// useNotifications() above stays unpaginated for the bell/dashboard-widget
// consumers, which only ever show the first page anyway.
export const useNotificationsPage = (params: { page: number; limit: number }) => {
  const { scopeKey } = useRoleContext();

  return useQuery({
    queryKey: ['notifications', 'page', scopeKey, params],
    queryFn: () => notificationsApi.listPage(params),
    ...QC.NOTIFICATIONS,
  });
};

export const useMarkNotificationRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
};

export const useMarkAllNotificationsRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
};
