import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { managementApi } from "./api";
import type { ManagedServicesResponse } from "./api";

export const useManagedOffices = (includeArchived = false) =>
  useQuery({
    queryKey: ["management", "offices", includeArchived],
    queryFn: () => managementApi.listOffices(includeArchived),
  });

export const useManagedDepartments = (
  officeId?: number,
  includeArchived = false,
) =>
  useQuery({
    queryKey: ["management", "departments", officeId ?? "all", includeArchived],
    queryFn: () => managementApi.listDepartments(officeId, includeArchived),
  });

export const useManagedServices = (params: {
  officeId?: number;
  page: number;
  limit: number;
  includeArchived?: boolean;
}) =>
  useQuery<ManagedServicesResponse>({
    queryKey: [
      "management",
      "services",
      params.officeId ?? "all",
      params.page,
      params.limit,
      params.includeArchived,
    ],
    queryFn: () => managementApi.listServicesPaginated(params),
  });

export const useManagedServicesList = (
  officeId?: number,
  includeArchived = false,
  search?: string,
) =>
  useQuery<ManagedServicesResponse>({
    queryKey: [
      "management",
      "services",
      "list",
      officeId ?? "all",
      includeArchived,
      search ?? "none",
    ],
    queryFn: () =>
      managementApi.listServices(officeId, includeArchived, search),
  });

function useManagementInvalidation() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: ["management"] });
    queryClient.invalidateQueries({ queryKey: ["offices-directory"] });
    queryClient.invalidateQueries({ queryKey: ["catalog"] });
  };
}

export const useCreateManagedOffice = () => {
  const invalidate = useManagementInvalidation();
  return useMutation({
    mutationFn: managementApi.createOffice,
    onSuccess: invalidate,
  });
};

export const useUpdateManagedOffice = () => {
  const invalidate = useManagementInvalidation();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: Parameters<typeof managementApi.updateOffice>[1];
    }) => managementApi.updateOffice(id, payload),
    onSuccess: invalidate,
  });
};

export const useArchiveManagedOffice = () => {
  const invalidate = useManagementInvalidation();
  return useMutation({
    mutationFn: managementApi.archiveOffice,
    onSuccess: invalidate,
  });
};

export const useRestoreManagedOffice = () => {
  const invalidate = useManagementInvalidation();
  return useMutation({
    mutationFn: managementApi.restoreOffice,
    onSuccess: invalidate,
  });
};

export const useDeleteManagedOffice = () => {
  const invalidate = useManagementInvalidation();
  return useMutation({
    mutationFn: managementApi.deleteOffice,
    onSuccess: invalidate,
  });
};

export const useCreateManagedDepartment = () => {
  const invalidate = useManagementInvalidation();
  return useMutation({
    mutationFn: managementApi.createDepartment,
    onSuccess: invalidate,
  });
};

export const useUpdateManagedDepartment = () => {
  const invalidate = useManagementInvalidation();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: Parameters<typeof managementApi.updateDepartment>[1];
    }) => managementApi.updateDepartment(id, payload),
    onSuccess: invalidate,
  });
};

export const useDeleteManagedDepartment = () => {
  const invalidate = useManagementInvalidation();
  return useMutation({
    mutationFn: managementApi.deleteDepartment,
    onSuccess: invalidate,
  });
};

export const useRestoreManagedDepartment = () => {
  const invalidate = useManagementInvalidation();
  return useMutation({
    mutationFn: managementApi.restoreDepartment,
    onSuccess: invalidate,
  });
};

export const useCreateManagedService = () => {
  const invalidate = useManagementInvalidation();
  return useMutation({
    mutationFn: managementApi.createService,
    onSuccess: invalidate,
  });
};

export const useUpdateManagedService = () => {
  const invalidate = useManagementInvalidation();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: Parameters<typeof managementApi.updateService>[1];
    }) => managementApi.updateService(id, payload),
    onSuccess: invalidate,
  });
};

export const useDeleteManagedService = () => {
  const invalidate = useManagementInvalidation();
  return useMutation({
    mutationFn: managementApi.deleteService,
    onSuccess: invalidate,
  });
};

export const useRestoreManagedService = () => {
  const invalidate = useManagementInvalidation();
  return useMutation({
    mutationFn: managementApi.restoreService,
    onSuccess: invalidate,
  });
};

export const useManagedVisits = (params: {
  page: number;
  limit: number;
  status?: string;
  officeId?: number;
}) =>
  useQuery({
    queryKey: ["management", "visits", params],
    queryFn: () =>
      managementApi.listVisits({
        page: params.page,
        limit: params.limit,
        status: params.status,
        office_id: params.officeId,
      }),
  });

export const useArchiveManagedVisit = () => {
  const invalidate = useManagementInvalidation();
  return useMutation({
    mutationFn: managementApi.archiveVisit,
    onSuccess: invalidate,
  });
};

export const useRestoreManagedVisit = () => {
  const invalidate = useManagementInvalidation();
  return useMutation({
    mutationFn: managementApi.restoreVisit,
    onSuccess: invalidate,
  });
};
