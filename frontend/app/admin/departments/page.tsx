"use client";

import { useMemo, useState, useEffect } from "react";
import {
  Building2,
  Loader2,
  Pencil,
  PlusCircle,
  Trash2,
  Workflow,
  ArchiveRestore,
} from "lucide-react";
import PaginationControls from "@shared/components/PaginationControls";
import { toast } from "sonner";
import clsx from "clsx";
import { BulkUploadOrgModal } from "@features/management/components/BulkUploadOrgModal";
import { Upload } from "lucide-react";
import {
  useCreateManagedDepartment,
  useDeleteManagedDepartment,
  useRestoreManagedDepartment,
  useManagedDepartments,
  useManagedOffices,
  useUpdateManagedDepartment,
} from "@features/management/hooks";
import { DEFAULT_PAGE_SIZE } from "@shared/lib/pagination";
import { Field } from "@shared/components/ui/Field";
import { useRoleContext } from "@shared/hooks/useRoleContext";
import { useResetOnChange } from '@shared/hooks/useResetOnChange';

export default function AdminDepartmentsPage() {
  const { officeId, isSuperAdmin } = useRoleContext();
  const [officeFilter, setOfficeFilter] = useState<number | undefined>(
    undefined,
  );
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const limit = DEFAULT_PAGE_SIZE;
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", office_id: 0 });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  const officesQuery = useManagedOffices();
  const departmentsQuery = useManagedDepartments(officeFilter, showArchived);
  const createMutation = useCreateManagedDepartment();
  const updateMutation = useUpdateManagedDepartment();
  const deleteMutation = useDeleteManagedDepartment();
  const restoreMutation = useRestoreManagedDepartment();

  const offices = useMemo(() => officesQuery.data ?? [], [officesQuery.data]);
  const officeScopedAdmin = !isSuperAdmin && officeId != null;
  const departments = useMemo(() => {
    const raw = departmentsQuery.data ?? [];
    if (!search.trim()) return raw;
    const q = search.toLowerCase().trim();
    return raw.filter((d) => d.name.toLowerCase().includes(q));
  }, [departmentsQuery.data, search]);

  useResetOnChange([search, officeFilter, showArchived], () => setPage(1));

  // Lock the filter and the create form to the office this admin is scoped to.
  // Adjusted during render so the list is never shown unscoped for a frame.
  useResetOnChange([officeId, officeScopedAdmin], () => {
    if (!officeScopedAdmin) {
      return;
    }

    setOfficeFilter(Number(officeId));
    setForm((current) => ({
      ...current,
      office_id: Number(officeId),
    }));
  });

  const totalPages = Math.max(1, Math.ceil(departments.length / limit));
  const paginatedDepartments = useMemo(
    () => departments.slice((page - 1) * limit, page * limit),
    [departments, page, limit],
  );
  const officeNameById = useMemo(
    () => new Map(offices.map((office) => [Number(office.id), office.name])),
    [offices],
  );

  const resetForm = () => {
    setEditingId(null);
    setForm({
      name: "",
      office_id: officeScopedAdmin
        ? Number(officeId)
        : officeFilter ?? offices[0]?.id ?? 0,
    });
    setError(null);
    setFieldErrors({});
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          payload: { name: form.name, office_id: form.office_id },
        });
        toast.success("Department updated.");
      } else {
        await createMutation.mutateAsync({
          name: form.name,
          office_id: form.office_id,
        });
        toast.success("Department created.");
      }
      resetForm();
    } catch (err: any) {
      const backendError = err.response?.data?.error;
      if (backendError?.details && Array.isArray(backendError.details)) {
        const mappedErrors: Record<string, string> = {};
        backendError.details.forEach((detail: any) => {
          if (detail.path) {
            const path = detail.path.replace(/^body\./, "");
            mappedErrors[path] = detail.message;
          }
        });
        setFieldErrors(mappedErrors);
      }
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error?.message ||
        "Unable to save department.";
      setError(msg);
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-8">
      <section className="ui-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Department Management
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Control booking destinations and route services to the right office
              teams.
            </p>
          </div>
          <button
            onClick={() => setIsBulkModalOpen(true)}
            className="ui-btn ui-btn-secondary px-6 py-3 text-xs font-bold uppercase tracking-widest flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            Bulk Seeding
          </button>
        </div>
      </section>

      <BulkUploadOrgModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        onSuccess={() => {
          void officesQuery.refetch();
          void departmentsQuery.refetch();
        }}
      />
      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] items-start">
        <section className="ui-card ui-card-elevated flex min-w-0 flex-col overflow-hidden">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-white">
                Department records
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Create, edit, and remove department mappings.
              </p>
              {officeScopedAdmin ? (
                <p className="mt-3 inline-flex w-fit rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-sky-300">
                  Office-scoped admin view
                </p>
              ) : null}
              <div className="flex bg-slate-900 p-1 mt-4 w-fit rounded-xl border border-slate-800">
                <button
                  onClick={() => setShowArchived(false)}
                  className={clsx(
                    "px-4 py-1.5 text-xs font-bold rounded-lg transition",
                    !showArchived
                      ? "bg-slate-800 text-white shadow-sm"
                      : "text-slate-500",
                  )}
                >
                  Active
                </button>
                <button
                  onClick={() => setShowArchived(true)}
                  className={clsx(
                    "px-4 py-1.5 text-xs font-bold rounded-lg transition",
                    showArchived
                      ? "bg-slate-800 text-white shadow-sm"
                      : "text-slate-500",
                  )}
                >
                  Archived
                </button>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-right">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                Visible departments
              </p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {departments.length}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <input
              type="search"
              placeholder="Search departments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ui-input w-full lg:w-48"
            />
            <select
              value={officeFilter ?? ""}
              onChange={(event) =>
                setOfficeFilter(
                  event.target.value ? Number(event.target.value) : undefined,
                )
              }
              className="ui-input w-full lg:w-56"
              disabled={officeScopedAdmin}
            >
              {!officeScopedAdmin ? <option value="">All offices</option> : null}
              {offices.map((office) => (
                <option key={office.id} value={office.id}>
                  {office.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-8 max-h-[600px] overflow-y-auto space-y-3 pr-2 ui-scrollbar">
            {departmentsQuery.isLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-20 animate-pulse rounded-2xl border border-slate-800 bg-slate-950/50"
                />
              ))
            ) : departmentsQuery.isError ? (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
                We couldn&apos;t load departments right now.
              </div>
            ) : (
              paginatedDepartments.map((department) => (
                <article
                  key={department.id}
                  className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="font-medium text-white">
                        {department.name}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        {(department as any).Office?.name || officeNameById.get(Number(department.office_id)) ||
                          `Office #${department.office_id}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(department.id);
                          setForm({
                            name: department.name,
                            office_id: Number(department.office_id),
                          });
                        }}
                        className="ui-btn ui-btn-secondary px-3 py-2 text-xs"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      {!showArchived ? (
                        <button
                          type="button"
                          onClick={() =>
                            deleteMutation.mutate(department.id, {
                              onSuccess: () =>
                                toast.success("Department archived."),
                              onError: (error: any) =>
                                toast.error(
                                  error?.response?.data?.error?.message ??
                                    "Unable to archive department.",
                                ),
                            })
                          }
                          className="ui-btn ui-btn-danger px-3 py-2 text-xs"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Archive
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            restoreMutation.mutate(department.id, {
                              onSuccess: () =>
                                toast.success("Department restored."),
                              onError: (error: any) =>
                                toast.error(
                                  error?.response?.data?.error?.message ??
                                    "Unable to restore department.",
                                ),
                            })
                          }
                          className="ui-btn border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-3 py-2 text-xs flex items-center justify-center gap-2 font-semibold transition lg:px-4"
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" />
                          Restore
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))
            )}

            {!departmentsQuery.isLoading &&
            !departmentsQuery.isError &&
            departments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-400">
                No departments found for the selected office.
              </div>
            ) : null}
            <div className="mt-6">
              <PaginationControls
                page={page}
                onPageChange={(newPage) =>
                  setPage(Math.min(totalPages, Math.max(1, newPage)))
                }
                hasNext={page < totalPages}
                hasPrevious={page > 1}
                totalPages={totalPages}
                isLoading={departmentsQuery.isFetching}
              />
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-8">
          <form
            onSubmit={submit}
            className="ui-card ui-card-elevated flex flex-col gap-6"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-300">
                <Workflow className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">
                  {editingId ? "Edit Department" : "Define Department"}
                </h3>
                <p className="text-sm text-slate-400">
                  Map internal teams to office locations.
                </p>
              </div>
            </div>

            <Field label="Parent Office" error={fieldErrors.office_id}>
              <select
                value={form.office_id}
                onChange={(e) =>
                  setForm({ ...form, office_id: Number(e.target.value) })
                }
                className="ui-input"
                required
                disabled={officeScopedAdmin}
              >
                {!officeScopedAdmin ? <option value="">Select office</option> : null}
                {offices.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Department Name" error={fieldErrors.name}>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="ui-input"
                required
                placeholder="e.g. Finance"
              />
            </Field>

            {error && (
              <p className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-400">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="ui-btn ui-btn-primary flex-1 rounded-2xl py-3 font-semibold"
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <PlusCircle className="h-5 w-5" />
                )}
                {editingId ? "Save changes" : "Create department"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="ui-btn ui-btn-secondary px-6 py-3 text-sm rounded-2xl"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400">
            <p className="inline-flex items-center gap-2 text-slate-200">
              <Building2 className="h-4 w-4" />
              Departments determine where services are routed and which hosts
              receive the traffic.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
