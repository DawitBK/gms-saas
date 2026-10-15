import { useQuery } from '@tanstack/react-query';
import { hostsApi } from './api';
import { useAuthStore } from '@state/auth.store';
import { QC } from '@shared/lib/query-config';

export const useCurrentHost = () => {
  const userId = useAuthStore((state) => state.userId);
  const selectedRole = useAuthStore((state) => state.selectedRole);
  
  return useQuery({
    queryKey: ['current-host', userId, selectedRole],
    queryFn: async () => {
      if (!userId) {
        return null;
      }
      
      // Get all hosts (API may return either an array or a paginated wrapper)
      const result = await hostsApi.list({ userId });
      const hosts = Array.isArray(result) ? result : (result?.data ?? []);
      const currentHost = hosts.find((host: any) => host.user_id === userId);
      
      return currentHost || null;
    },
    enabled: !!userId,
    staleTime: QC.STATIC.staleTime,
  });
};
