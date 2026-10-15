import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { officesApi } from './api';

export const useOfficesDirectory = () =>
  useQuery({
    queryKey: ['offices-directory'],
    queryFn: () => officesApi.list(),
  });

export const useCreateOffice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: officesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offices-directory'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'offices'] });
    },
  });
};
