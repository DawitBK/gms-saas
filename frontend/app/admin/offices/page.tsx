"use client";

import { FormEvent, useMemo, useState, useEffect } from "react";
import {
  Building2,
  Globe2,
  Loader2,
  MapPin,
  Pencil,
  PlusCircle,
  Trash2,
  ArchiveRestore,
} from "lucide-react";
import PaginationControls from "@shared/components/PaginationControls";
import { toast } from "sonner";
import { clsx } from "clsx";
import dynamic from "next/dynamic";

const MapPicker = dynamic(() => import("@shared/components/MapPicker"), { ssr: false });
import {
  useArchiveManagedOffice,
  useCreateManagedOffice,
  useManagedOffices,
  useUpdateManagedOffice,
  useRestoreManagedOffice,
} from "@features/management/hooks";
import type { ManagedOffice, OfficePayload } from "@features/management/types";
import { DEFAULT_PAGE_SIZE } from "@shared/lib/pagination";
import { Field } from "@shared/components/ui/Field";
import { RoleGate } from "@shared/components/RoleGate";
import { BulkUploadOrgModal } from "@features/management/components/BulkUploadOrgModal";
import { Upload } from "lucide-react";
import { useResetOnChange } from '@shared/hooks/useResetOnChange';

const emptyForm: OfficePayload = {
  name: "",
  address: "",
  city: "",
  country: "",
  timezone: "Africa/Nairobi",
  latitude: undefined,
  longitude: undefined,
};

export default function AdminOfficesPage() {
  return (
    <RoleGate allow={["super_admin"]} fallbackHref="/admin">
      <AdminOfficesContent />
    </RoleGate>
  );
}

function AdminOfficesContent() {
  const [form, setForm] = useState<OfficePayload>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const limit = DEFAULT_PAGE_SIZE;
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  const officesQuery = useManagedOffices(showArchived);
  const createOfficeMutation = useCreateManagedOffice();
  const updateOfficeMutation = useUpdateManagedOffice();
  const archiveOfficeMutation = useArchiveManagedOffice();
  const restoreOfficeMutation = useRestoreManagedOffice();

  const offices = useMemo(() => officesQuery.data ?? [], [officesQuery.data]);

  useResetOnChange([search, showArchived], () => {
    setPage(1);
  });

  const filteredOffices = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return offices;
    return offices.filter(
      (o) =>
        (o.name ?? "").toLowerCase().includes(q) ||
        (o.city ?? "").toLowerCase().includes(q),
    );
  }, [offices, search]);

  const totalPages = Math.max(1, Math.ceil(filteredOffices.length / limit));
  const paginatedOffices = useMemo(
    () => filteredOffices.slice((page - 1) * limit, page * limit),
    [filteredOffices, page, limit],
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (form.latitude === undefined || form.longitude === undefined) {
      setError("Please drop a pin on the map to set the office location.");
      return;
    }

    try {
      if (editingId) {
        await updateOfficeMutation.mutateAsync({
          id: editingId,
          payload: form,
        });
        toast.success("Office updated successfully.");
      } else {
        await createOfficeMutation.mutateAsync(form);
        toast.success("Office created successfully.");
      }

      setEditingId(null);
      setForm(emptyForm);
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
        "Unable to save office.";
      setError(msg);
      toast.error(msg);
    }
  };

  const startEdit = (office: ManagedOffice) => {
    setEditingId(office.id);
    setForm({
      name: office.name,
      address: office.address,
      city: office.city,
      country: office.country,
      timezone: office.timezone,
      active: office.active,
      latitude: office.latitude,
      longitude: office.longitude,
    });
    setError(null);
  };

  const archiveOffice = async (officeId: number) => {
    try {
      await archiveOfficeMutation.mutateAsync(officeId);
      if (editingId === officeId) {
        setEditingId(null);
        setForm(emptyForm);
      }
      toast.success("Office archived successfully.");
    } catch (mutationError: any) {
      toast.error(
        mutationError?.response?.data?.error?.message ??
          mutationError?.response?.data?.message ??
          "Unable to archive office.",
      );
    }
  };

  const isSaving =
    createOfficeMutation.isPending || updateOfficeMutation.isPending;

  const restoreOffice = async (officeId: number) => {
    try {
      await restoreOfficeMutation.mutateAsync(officeId);
      toast.success("Office restored successfully.");
    } catch (err: any) {
      toast.error("Unable to restore office.");
    }
  };

  return (
    <div className="space-y-8">
      <section className="ui-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Office Directory
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Keep booking destinations, local city details, and timezone
              configuration accurate across every site.
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
        onSuccess={() => void officesQuery.refetch()}
      />
      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] items-start">
        <section className="ui-card ui-card-elevated">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-white">
                Office records
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Create, update, and archive office locations.
              </p>

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
                Visible offices
              </p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {filteredOffices.length}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <input
              type="search"
              placeholder="Search offices by name or city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ui-input w-full lg:w-64"
            />
          </div>

          {officesQuery.isLoading ? (
            <div className="mt-8 grid gap-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-24 animate-pulse rounded-2xl bg-slate-800/70"
                />
              ))}
            </div>
          ) : officesQuery.isError ? (
            <div className="mt-8 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
              We couldn&apos;t load office records right now.
            </div>
          ) : (
            <div className="mt-8 max-h-[600px] overflow-y-auto grid gap-4 pr-2 ui-scrollbar">
              {paginatedOffices.map((office) => (
                <article
                  key={office.id}
                  className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5"
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <h2 className="text-lg font-semibold text-white">
                          {office.name}
                        </h2>
                        <div className="mt-3 grid gap-2 text-sm text-slate-400 md:grid-cols-2 xl:grid-cols-3">
                          <span className="inline-flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            {office.address}
                          </span>
                          <span className="inline-flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            {office.city}, {office.country}
                          </span>
                          <span className="inline-flex items-center gap-2">
                            <Globe2 className="h-4 w-4" />
                            {office.timezone}
                          </span>
                        </div>
                      </div>
                      <span className="w-fit rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-emerald-300">
                        {office.active ? "active" : "inactive"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 border-t border-slate-800/80 pt-4">
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-emerald-300">
                        Actions
                      </span>
                      <button
                        type="button"
                        onClick={() => startEdit(office)}
                        className="ui-btn ui-btn-secondary px-3 py-2 text-xs"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      {office.active !== false ? (
                        <button
                          type="button"
                          onClick={() => void archiveOffice(office.id)}
                          disabled={archiveOfficeMutation.isPending}
                          className="ui-btn ui-btn-danger px-3 py-2 text-xs"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Archive
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void restoreOffice(office.id)}
                          disabled={restoreOfficeMutation.isPending}
                          className="ui-btn border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-3 py-2 text-xs flex items-center justify-center gap-2 font-semibold transition lg:px-4"
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" />
                          Restore
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
              {filteredOffices.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-400">
                  No offices found. Create your first office to enable routing
                  and services.
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
                  isLoading={officesQuery.isFetching}
                />
              </div>
            </div>
          )}
        </section>

        <form
          onSubmit={handleSubmit}
          className="ui-card ui-card-elevated flex flex-col gap-6"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-300">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                {editingId ? "Edit Office" : "Register Office"}
              </h3>
              <p className="text-sm text-slate-400">
                Add a physical location to the network.
              </p>
            </div>
          </div>

          <Field label="Office Name" error={fieldErrors.name}>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="ui-input"
              required
              placeholder="e.g. Branch A"
            />
          </Field>

          <Field label="Address" error={fieldErrors.address}>
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="ui-input"
              required
              placeholder="123 Street Name"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="City" error={fieldErrors.city}>
              <input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="ui-input"
                required
                placeholder="City"
              />
            </Field>
            <Field label="Country" error={fieldErrors.country}>
              <input
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className="ui-input"
                required
                placeholder="Country"
              />
            </Field>
          </div>

          <Field label="Timezone" error={fieldErrors.timezone}>
            <select
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              className="ui-input"
              required
            >
              <option value="Africa/Nairobi">East Africa Time (EAT)</option>
              <option value="UTC">UTC</option>
            </select>
          </Field>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-300">
              Office Geolocation <span className="text-rose-400">*</span>
            </label>
            <p className="text-xs text-slate-500 mb-2">Type the exact coordinates below or click on the map to place a pin.</p>
            <MapPicker
              latitude={form.latitude}
              longitude={form.longitude}
              onChange={(lat, lng) => setForm({ ...form, latitude: lat, longitude: lng })}
            />
            {fieldErrors.latitude && <p className="text-xs text-rose-400 mt-1">{fieldErrors.latitude}</p>}
            {fieldErrors.longitude && <p className="text-xs text-rose-400 mt-1">{fieldErrors.longitude}</p>}
          </div>

          {error && (
            <p className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-400">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="ui-btn ui-btn-primary flex-1 rounded-2xl py-3 font-semibold"
            >
              {isSaving ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <PlusCircle className="h-5 w-5" />
              )}
              {editingId ? "Save changes" : "Create office"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm);
                  setError(null);
                  setFieldErrors({});
                }}
                className="ui-btn ui-btn-secondary px-6 py-3 text-sm rounded-2xl"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
