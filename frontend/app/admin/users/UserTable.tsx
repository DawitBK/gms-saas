"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCircle2,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { toast } from "sonner";
import PaginationControls from "@shared/components/PaginationControls";
import {
  useAdminUsers,
  useDeleteUser,
  useRestoreUser,
  useSetUserRoles,
  useUpdateUser,
} from "@features/admin/hooks";
import type { AdminUser } from "@features/admin/types";
import {
  useManagedDepartments,
  useManagedOffices,
  useManagedServicesList,
} from "@features/management/hooks";
import { DEFAULT_PAGE_SIZE } from "@shared/lib/pagination";
import { useRoleContext } from "@shared/hooks/useRoleContext";
import { usePermission } from "@shared/hooks/usePermission";
import {
  canAssignSuperRoles,
  getRoleDescription,
  getRoleLabel,
  getRoleScopeLabel,
  requiresDepartmentAssignment,
  requiresOfficeAssignment,
} from "@shared/lib/roles";

type EditFormState = {
  full_name: string;
  email: string;
  phone: string;
  password: string;
  roles: string[];
  next_role: string;
  office_id: string;
  department_id: string;
  service_ids: number[];
  active: boolean;
  company: string;
  government_id: string;
  document_url: string;
};

function uniqueRoles(roles: string[]) {
  return Array.from(new Set(roles.filter(Boolean)));
}

export default function UserTable() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { activeRole } = useRoleContext();
  const { can } = usePermission();

  const allowSuperRoleAssignment = canAssignSuperRoles(activeRole);
  const canManageUsers = can("manage", "user");
  const [page, setPage] = useState(1);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState(() => searchParams.get("q") || "");
  const [roleDrafts, setRoleDrafts] = useState<Record<number, string[]>>({});
  const [rolePickers, setRolePickers] = useState<Record<number, string>>({});
  const [savingRoleUserId, setSavingRoleUserId] = useState<number | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);

  const limit = DEFAULT_PAGE_SIZE;
  const { data, isLoading, isError, refetch } = useAdminUsers({
    page,
    limit,
    showArchived,
    q: query.trim() || undefined,
  });
  const officesQuery = useManagedOffices(false);
  const editOfficeId = editForm?.office_id
    ? Number(editForm.office_id)
    : undefined;
  const departmentsQuery = useManagedDepartments(editOfficeId, false);
  const servicesQuery = useManagedServicesList(editOfficeId, false);
  const deleteUser = useDeleteUser();
  const restoreUser = useRestoreUser();
  const setUserRoles = useSetUserRoles();
  const updateUser = useUpdateUser();

  const users = useMemo<AdminUser[]>(() => data?.users ?? [], [data?.users]);
  const totalUsers = data?.meta?.total ?? users.length;
  const currentPage = data?.meta?.page ?? page;
  const totalPages = data?.meta?.totalPages ?? 1;
  const hasNextPage = currentPage < totalPages;
  const roleOptions = useMemo(
    () =>
      [
        "admin",
        "reception",
        "host",
        ...(allowSuperRoleAssignment
          ? ["super_admin", "super_reception", "super_host"]
          : []),
      ] as string[],
    [allowSuperRoleAssignment],
  );
  const officeOptions = useMemo(
    () => officesQuery.data ?? [],
    [officesQuery.data],
  );
  const departmentOptions = useMemo(
    () => departmentsQuery.data ?? [],
    [departmentsQuery.data],
  );
  const serviceOptions = useMemo(
    () => servicesQuery.data?.services ?? [],
    [servicesQuery.data?.services],
  );

  const handleUpdateUrl = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, pathname, router],
  );

  useEffect(() => {
    handleUpdateUrl({ q: query || null });
  }, [query, handleUpdateUrl]);

  const toggleArchive = () => {
    setShowArchived((current) => !current);
    setPage(1);
  };

  const describeProvisioningScope = useCallback(
    (user: {
      office_id?: number | string | null;
      department_id?: number | string | null;
      office_name?: string | null;
      department_name?: string | null;
    }) => {
      if (user.office_name && user.department_name) {
        return `${user.office_name} • ${user.department_name}`;
      }
      if (user.office_name) {
        return user.office_name;
      }
      if (user.office_id && user.department_id) {
        return `Office #${user.office_id} • Department #${user.department_id}`;
      }
      if (user.office_id) {
        return `Office #${user.office_id}`;
      }
      return "Global or unassigned";
    },
    [],
  );

  const getDraftRoles = useCallback(
    (user: AdminUser) => uniqueRoles(roleDrafts[user.id] ?? user.roles ?? []),
    [roleDrafts],
  );

  const getNextRoleOption = useCallback(
    (roles: string[]) =>
      roleOptions.find((role) => !roles.includes(role)) ??
      roleOptions[0] ??
      "admin",
    [roleOptions],
  );

  const addDraftRole = (user: AdminUser) => {
    const currentRoles = getDraftRoles(user);
    const pickedRole = rolePickers[user.id] ?? getNextRoleOption(currentRoles);
    if (!pickedRole || currentRoles.includes(pickedRole)) {
      return;
    }
    const nextRoles = uniqueRoles([...currentRoles, pickedRole]);
    setRoleDrafts((current) => ({ ...current, [user.id]: nextRoles }));
    setRolePickers((current) => ({
      ...current,
      [user.id]: getNextRoleOption(nextRoles),
    }));
  };

  const removeDraftRole = (user: AdminUser, role: string) => {
    const nextRoles = getDraftRoles(user).filter((item) => item !== role);
    setRoleDrafts((current) => ({ ...current, [user.id]: nextRoles }));
    setRolePickers((current) => ({
      ...current,
      [user.id]: getNextRoleOption(nextRoles),
    }));
  };

  const restoreAccount = (userId: number) => {
    restoreUser.mutate(userId, {
      onSuccess: () => toast.success(`User #${userId} restored.`),
      onError: (error: any) =>
        toast.error(
          error?.response?.data?.error?.message ??
            error?.response?.data?.message ??
            "Unable to restore user.",
        ),
    });
  };

  const deleteAccount = (userId: number) => {
    setDeletingUserId(userId);
    deleteUser.mutate(userId, {
      onSuccess: () => {
        toast.success(`User #${userId} deleted.`);
        if (editingUser?.id === userId) {
          setEditingUser(null);
          setEditForm(null);
        }
      },
      onError: (error: any) =>
        toast.error(
          error?.response?.data?.error?.message ??
            error?.response?.data?.message ??
            "Unable to delete user.",
        ),
      onSettled: () => setDeletingUserId(null),
    });
  };

  const saveRoles = (user: AdminUser) => {
    const roles = getDraftRoles(user);
    if (roles.length === 0) {
      toast.error("At least one role is required.");
      return;
    }

    setSavingRoleUserId(user.id);
    setUserRoles.mutate(
      { id: user.id, roles },
      {
        onSuccess: () =>
          toast.success(
            `Updated ${roles.length} role${roles.length === 1 ? "" : "s"}.`,
          ),
        onError: (error: any) =>
          toast.error(
            error?.response?.data?.error?.message ??
              error?.response?.data?.message ??
              "Unable to update user roles.",
          ),
        onSettled: () => setSavingRoleUserId(null),
      },
    );
  };

  const openEditModal = (user: AdminUser) => {
    const initialRoles = uniqueRoles(user.roles ?? []);
    setEditingUser(user);
    setEditForm({
      full_name: user.full_name || "",
      email: user.email || "",
      phone: user.phone || "",
      password: "",
      roles: initialRoles,
      next_role: getNextRoleOption(initialRoles),
      office_id: user.office_id ? String(user.office_id) : "",
      department_id: user.department_id ? String(user.department_id) : "",
      service_ids: user.service_ids ?? [],
      active: (user.status ?? "ACTIVE") === "ACTIVE",
      company: user.company || "",
      government_id: user.government_id || "",
      document_url: user.document_url || "",
    });
  };

  const closeEditModal = () => {
    setEditingUser(null);
    setEditForm(null);
  };

  const addEditRole = () => {
    if (!editForm?.next_role) {
      return;
    }
    if (editForm.roles.includes(editForm.next_role)) {
      return;
    }
    const nextRoles = uniqueRoles([...editForm.roles, editForm.next_role]);
    setEditForm((current) =>
      current
        ? {
            ...current,
            roles: nextRoles,
            next_role: getNextRoleOption(nextRoles),
          }
        : current,
    );
  };

  const removeEditRole = (role: string) => {
    setEditForm((current) => {
      if (!current) return current;
      const nextRoles = current.roles.filter((item) => item !== role);
      return {
        ...current,
        roles: nextRoles,
        next_role: getNextRoleOption(nextRoles),
      };
    });
  };

  const toggleEditService = (serviceId: number) => {
    setEditForm((current) => {
      if (!current) return current;
      const exists = current.service_ids.includes(serviceId);
      return {
        ...current,
        service_ids: exists
          ? current.service_ids.filter((id) => id !== serviceId)
          : [...current.service_ids, serviceId],
      };
    });
  };

  const saveUserDetails = async () => {
    if (!editingUser || !editForm) {
      return;
    }

    if (editForm.roles.length === 0) {
      toast.error("At least one role is required.");
      return;
    }

    try {
      await updateUser.mutateAsync({
        id: editingUser.id,
        full_name: editForm.full_name.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
        password: editForm.password.trim() || undefined,
        roles: editForm.roles,
        office_id: editForm.office_id ? Number(editForm.office_id) : null,
        department_id: editForm.department_id
          ? Number(editForm.department_id)
          : null,
        service_ids: editForm.service_ids,
        replace_service_assignments: true,
        active: editForm.active,
        company: editForm.company.trim() || null,
        government_id: editForm.government_id.trim() || null,
      });
      toast.success("User account updated.");
      closeEditModal();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error?.message ??
          error?.response?.data?.message ??
          "Unable to update user profile.",
      );
    }
  };

  const renderRoleEditor = (user: AdminUser) => {
    const draftRoles = getDraftRoles(user);
    const pickerValue = rolePickers[user.id] ?? getNextRoleOption(draftRoles);

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {draftRoles.length > 0 ? (
            draftRoles.map((role) => (
              <RoleChip
                key={`${user.id}-${role}`}
                role={role}
                removable={canManageUsers}
                onRemove={() => removeDraftRole(user, role)}
              />
            ))
          ) : (
            <span className="text-xs text-slate-500">No roles selected</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={pickerValue}
            onChange={(event) =>
              setRolePickers((current) => ({
                ...current,
                [user.id]: event.target.value,
              }))
            }
            className="ui-input min-w-[180px] px-2 py-2 text-xs"
          >
            {roleOptions.map((role) => (
              <option
                key={role}
                value={role}
                disabled={draftRoles.includes(role)}
              >
                {getRoleLabel(role)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="ui-btn ui-btn-secondary px-3 py-2 text-xs font-semibold"
            onClick={() => addDraftRole(user)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add role
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-primary px-3 py-2 text-xs font-semibold"
            onClick={() => saveRoles(user)}
            disabled={savingRoleUserId === user.id}
          >
            {savingRoleUserId === user.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Save roles"
            )}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Add any of the six staff roles here. Office, department, password, and
          services are updated from Manage.
        </p>
      </div>
    );
  };

  return (
    <section className="ui-card ui-card-elevated">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Directory</h3>
          <p className="mt-1 text-sm text-slate-400">
            Review staff access, role coverage, and account readiness.
          </p>
          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">
            {isLoading
              ? "Loading users..."
              : `${totalUsers} account${totalUsers === 1 ? "" : "s"} available`}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={toggleArchive}
            className={clsx(
              "ui-btn px-4 py-2 text-sm font-semibold transition",
              showArchived
                ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                : "border-slate-700 bg-slate-800 text-slate-400",
            )}
          >
            {showArchived ? "View Active" : "View Archived"}
          </button>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              aria-label="Search users by name, email, or role"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search name, email, or role"
              className="ui-input w-full py-3 pl-10 pr-4 lg:w-72"
            />
          </label>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-16 animate-pulse rounded-2xl bg-slate-800/70"
            />
          ))}
        </div>
      ) : isError ? (
        <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          Failed to load users.
          <button
            type="button"
            onClick={() => void refetch()}
            className="ui-btn ui-btn-danger ml-3 border-0 px-0 text-rose-100 underline"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      ) : users.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-400">
          {query.trim()
            ? "No users match the current search."
            : "No users have been created yet."}
        </div>
      ) : (
        <>
          <div className="mt-6 block space-y-3 xl:hidden">
            {users.map((user) => (
              <div
                key={user.id}
                className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"
              >
                <div className="mb-3 grid gap-2">
                  <p className="text-sm font-semibold text-white">
                    {user.full_name || "No name on file"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {user.email || "No email on file"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {user.phone || "No phone on file"}
                  </p>
                  <p className="text-xs text-slate-400">
                    Presence: {user.presence || "OFFLINE"}
                  </p>
                  <p className="text-xs text-slate-400">
                    Scope: {describeProvisioningScope(user)}
                  </p>
                  <p className="text-xs text-slate-400">
                    Services:{" "}
                    {(user.service_ids ?? []).length > 0
                      ? user.service_ids?.length
                      : 0}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-100">
                    {user.status || "ACTIVE"}
                  </span>
                  <span className="text-xs text-slate-400">
                    ID: {user.id || "NA"}
                  </span>
                </div>
                {canManageUsers ? (
                  <>
                    <div className="mt-3">{renderRoleEditor(user)}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="ui-btn ui-btn-secondary px-3 py-2 text-xs font-semibold"
                        onClick={() => openEditModal(user)}
                      >
                        Manage
                      </button>
                      {showArchived ? (
                        <button
                          type="button"
                          className="ui-btn ui-btn-secondary px-3 py-2 text-xs font-semibold"
                          onClick={() => restoreAccount(user.id)}
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ui-btn ui-btn-danger px-3 py-2 text-xs font-semibold"
                          onClick={() => deleteAccount(user.id)}
                          disabled={deletingUserId === user.id}
                        >
                          {deletingUserId === user.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Delete
                        </button>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-6 hidden max-h-[640px] overflow-y-auto overflow-x-hidden rounded-3xl border border-slate-800 xl:block ui-scrollbar">
            <div className="overflow-x-auto p-3">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-slate-950/80 text-slate-400">
                  <tr className="border-b border-slate-800">
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Presence</th>
                    <th className="px-4 py-3">Scope</th>
                    <th className="px-4 py-3">Roles</th>
                    <th className="px-4 py-3">Edit Roles</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="ui-table-row">
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-200">
                        {user.id || "NA"}
                      </td>
                      <td className="px-4 py-3 text-sm text-white">
                        <div className="flex items-center gap-2">
                          <UserCircle2 className="h-4 w-4 text-cyan-300" />
                          <span className="break-words">
                            {user.full_name || "No name on file"}
                          </span>
                        </div>
                      </td>
                      <td className="max-w-[220px] break-words px-4 py-3 text-sm text-slate-200">
                        {user.email || "No email on file"}
                      </td>
                      <td className="break-words px-4 py-3 text-sm text-slate-300">
                        {user.phone || "No phone on file"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                          {user.status || "ACTIVE"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {user.presence || "OFFLINE"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        <div className="space-y-1">
                          <p>{describeProvisioningScope(user)}</p>
                          <p className="text-xs text-slate-500">
                            {user.service_ids?.length ?? 0} service assignment
                            {(user.service_ids?.length ?? 0) === 1 ? "" : "s"}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        <div className="flex flex-wrap gap-1">
                          {(user.roles.length > 0
                            ? user.roles
                            : ["No roles"]
                          ).map((role) => (
                            <RoleChip key={`${user.id}-${role}`} role={role} />
                          ))}
                        </div>
                      </td>
                      <td className="min-w-[280px] px-4 py-3">
                        {canManageUsers ? renderRoleEditor(user) : null}
                      </td>
                      <td className="px-4 py-3">
                        {canManageUsers ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="ui-btn ui-btn-secondary px-2 py-1 text-xs font-semibold"
                              onClick={() => openEditModal(user)}
                            >
                              Manage
                            </button>
                            {showArchived ? (
                              <button
                                type="button"
                                className="ui-btn ui-btn-secondary px-2 py-1 text-xs font-semibold"
                                onClick={() => restoreAccount(user.id)}
                              >
                                Restore
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="ui-btn ui-btn-danger px-2 py-1 text-xs font-semibold"
                                onClick={() => deleteAccount(user.id)}
                                disabled={deletingUserId === user.id}
                              >
                                {deletingUserId === user.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                                Delete
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs italic text-slate-500">
                            No permission
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 p-4">
            <PaginationControls
              page={currentPage}
              onPageChange={setPage}
              hasNext={hasNextPage}
              totalPages={totalPages}
            />
          </div>
        </>
      )}

      {editingUser && editForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="ui-card ui-card-elevated w-full max-w-4xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-xl font-semibold text-white">
                  Manage user #{editingUser.id}
                </h4>
                <p className="mt-1 text-sm text-slate-400">
                  Update identity, passwords, roles, office and department
                  scope, and host-service assignments.
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                className="ui-btn ui-btn-ghost p-2"
                aria-label="Close user management panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">
                  Full name
                </span>
                <input
                  value={editForm.full_name}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current
                        ? { ...current, full_name: event.target.value }
                        : current,
                    )
                  }
                  className="ui-input"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">
                  Email
                </span>
                <input
                  value={editForm.email}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current
                        ? { ...current, email: event.target.value }
                        : current,
                    )
                  }
                  className="ui-input"
                  type="email"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">
                  Phone
                </span>
                <input
                  value={editForm.phone}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current
                        ? { ...current, phone: event.target.value }
                        : current,
                    )
                  }
                  className="ui-input"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">
                  New password
                </span>
                <input
                  value={editForm.password}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current
                        ? { ...current, password: event.target.value }
                        : current,
                    )
                  }
                  className="ui-input"
                  type="password"
                  placeholder="Leave blank to keep current password"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">
                  Company
                </span>
                <input
                  value={editForm.company}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current
                        ? { ...current, company: event.target.value }
                        : current,
                    )
                  }
                  className="ui-input"
                  placeholder="Organization"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">
                  Government ID / Passport
                </span>
                <input
                  value={editForm.government_id}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current
                        ? { ...current, government_id: event.target.value }
                        : current,
                    )
                  }
                  className="ui-input"
                  placeholder="ID Number"
                />
              </label>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Roles</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Combine any of the six staff roles for the same account.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={editForm.next_role}
                      onChange={(event) =>
                        setEditForm((current) =>
                          current
                            ? { ...current, next_role: event.target.value }
                            : current,
                        )
                      }
                      className="ui-input min-w-[180px]"
                    >
                      {roleOptions.map((role) => (
                        <option
                          key={role}
                          value={role}
                          disabled={editForm.roles.includes(role)}
                        >
                          {getRoleLabel(role)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={addEditRole}
                      className="ui-btn ui-btn-secondary px-3 py-2 text-sm font-semibold"
                    >
                      <Plus className="h-4 w-4" />
                      Add role
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {editForm.roles.length > 0 ? (
                    editForm.roles.map((role) => (
                      <RoleChip
                        key={`edit-${role}`}
                        role={role}
                        removable
                        onRemove={() => removeEditRole(role)}
                      />
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">
                      No roles selected.
                    </span>
                  )}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {editForm.roles.map((role) => (
                    <div
                      key={`detail-${role}`}
                      className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
                          {getRoleScopeLabel(role)}
                        </span>
                        <span className="text-sm font-medium text-white">
                          {getRoleLabel(role)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">
                        {getRoleDescription(role)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-sm font-semibold text-white">
                  Account state
                </p>
                <label className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-white">
                      Active account
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Disable to mark the user inactive without deleting the
                      record.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={editForm.active}
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? { ...current, active: event.target.checked }
                          : current,
                      )
                    }
                    className="h-4 w-4 accent-cyan-400"
                  />
                </label>
                <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
                  <p>Current scope: {describeProvisioningScope(editForm)}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Office and department are optional. Service assignments can
                    be updated independently.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">
                  Office
                </span>
                <select
                  value={editForm.office_id}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current
                        ? {
                            ...current,
                            office_id: event.target.value,
                            department_id: "",
                          }
                        : current,
                    )
                  }
                  className="ui-input"
                >
                  <option value="">No office assignment</option>
                  {officeOptions.map((office) => (
                    <option key={office.id} value={office.id}>
                      {office.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-500">
                  Department
                </span>
                <select
                  value={editForm.department_id}
                  onChange={(event) =>
                    setEditForm((current) =>
                      current
                        ? { ...current, department_id: event.target.value }
                        : current,
                    )
                  }
                  className="ui-input"
                  disabled={!editForm.office_id || departmentsQuery.isLoading}
                >
                  <option value="">No department assignment</option>
                  {departmentOptions.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Service assignments
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Host to service links stay in sync in both directions when
                    you save.
                  </p>
                </div>
                <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
                  {editForm.service_ids.length} selected
                </span>
              </div>

              {serviceOptions.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  No services available for the current office filter.
                </p>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {serviceOptions.map((service) => (
                    <label
                      key={service.id}
                      className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3"
                    >
                      <input
                        type="checkbox"
                        checked={editForm.service_ids.includes(service.id)}
                        onChange={() => toggleEditService(service.id)}
                        className="mt-1 h-4 w-4 accent-cyan-400"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-white">
                          {service.name}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {service.Department?.name ??
                            service.department?.name ??
                            "Unassigned department"}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-slate-300">
              <p>
                Roles that usually use office scope:{" "}
                {editForm.roles
                  .filter((role) => requiresOfficeAssignment(role))
                  .map(getRoleLabel)
                  .join(", ") || "none"}
              </p>
              <p className="mt-2">
                Roles that usually use department scope:{" "}
                {editForm.roles
                  .filter((role) => requiresDepartmentAssignment(role))
                  .map(getRoleLabel)
                  .join(", ") || "none"}
              </p>
            </div>

            <div className="mt-6 flex flex-wrap justify-between gap-3">
              <div className="flex flex-wrap gap-3">
                {showArchived ? (
                  <button
                    type="button"
                    onClick={() => restoreAccount(editingUser.id)}
                    className="ui-btn ui-btn-secondary px-4 py-2 text-sm"
                  >
                    Restore user
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => deleteAccount(editingUser.id)}
                    disabled={deletingUserId === editingUser.id}
                    className="ui-btn ui-btn-danger px-4 py-2 text-sm"
                  >
                    {deletingUserId === editingUser.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Delete user
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="ui-btn ui-btn-secondary px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveUserDetails()}
                  disabled={updateUser.isPending}
                  className="ui-btn ui-btn-primary px-4 py-2 text-sm font-semibold"
                >
                  {updateUser.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Save changes
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function RoleChip({
  role,
  removable = false,
  onRemove,
}: {
  role: string;
  removable?: boolean;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-slate-600 bg-slate-800/70 px-2 py-1 text-[11px] font-semibold text-slate-100">
      <ShieldCheck className="h-3 w-3" />
      {getRoleLabel(role)}
      {removable ? (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full p-0.5 text-slate-400 transition hover:bg-slate-700 hover:text-white"
          aria-label={`Remove ${getRoleLabel(role)}`}
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}
