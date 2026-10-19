import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@state/auth.store';
import { useRoleContext } from '@shared/hooks/useRoleContext';
import { licenseApi } from './api';

const FIVE_MINUTES = 5 * 60 * 1000;

/**
 * The licence status, for the banner and for hiding menu entries of disabled modules.
 *
 * It must never get in the way: no retries, a failed fetch simply leaves `data` undefined (which the
 * UI reads as "no licence information: show everything, no banner"), and it only runs for a signed-in
 * session.
 */
export const useLicenseStatus = () => {
  const { scopeKey } = useRoleContext();
  const authenticated = useAuthStore((state) => state.authenticated);

  return useQuery({
    queryKey: ['license', 'status', scopeKey],
    queryFn: () => licenseApi.getStatus(),
    enabled: authenticated,
    retry: false,
    staleTime: FIVE_MINUTES,
    refetchInterval: FIVE_MINUTES,
    refetchOnWindowFocus: false,
  });
};
