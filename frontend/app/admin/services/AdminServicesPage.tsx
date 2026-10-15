"use client";

import { useCallback, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Clock3,
  Loader2,
  Pencil,
  PlusCircle,
  Trash2,
  ArchiveRestore,
  ShieldPlus,
  Briefcase,
  Users,
  Search,
  Check,
  ChevronDown,
  ChevronUp,
  Settings,
  X,
  Plus
} from "lucide-react";
import PaginationControls from "@shared/components/PaginationControls";
import { Field } from "@shared/components/ui/Field";
import { toast } from "sonner";
import clsx from "clsx";
import { useHosts } from "@features/hosts/hooks";
import type { ManagedServicesResponse } from "@features/management/api";
import {
  useCreateManagedService,
  useDeleteManagedService,
  useRestoreManagedService,
  useManagedDepartments,
  useManagedOffices,
  useManagedServicesList,
  useUpdateManagedService,
} from "@features/management/hooks";
import { useRoleContext } from "@shared/hooks/useRoleContext";
import { RoleGate } from "@shared/components/RoleGate";
import { useState, useEffect } from "react";
import { BulkUploadOrgModal } from "@features/management/components/BulkUploadOrgModal";
import { Upload } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function AdminServicesPage() {
  return (
    <RoleGate allow={["admin", "super_admin"]} fallbackHref="/admin">
      <AdminServicesContent />
    </RoleGate>
  );
}

function AdminServicesContent() {
  const { officeId: userOfficeId, isSuperAdmin } = useRoleContext();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Source of Truth: URL
  const officeFilter = searchParams.get("office_id") ? Number(searchParams.get("office_id")) : undefined;
  const departmentFilter = searchParams.get("department_id") ? Number(searchParams.get("department_id")) : undefined;
  const showArchived = searchParams.get("status") === "archived";
  const search = searchParams.get("q") || "";
  const page = Number(searchParams.get("page") || "1");
  const limit = 5;

  const officeScopedAdmin = !isSuperAdmin && userOfficeId != null;
  const effectiveOfficeId = officeScopedAdmin ? Number(userOfficeId) : officeFilter;

  const updateUrl = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null) params.delete(key);
      else params.set(key, value);
    });
    router.replace(`${pathname}?${params.toString()}`);
  }, [searchParams, pathname, router]);

  // Form State
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    office_id: effectiveOfficeId ?? 0,
    department_id: 0,
    duration_minutes: 30,
    host_ids: [] as number[],
  });
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [expandedServiceId, setExpandedServiceId] = useState<number | null>(null);
  const [isAssigningHosts, setIsAssigningHosts] = useState(false);
  const [hostSearch, setHostSearch] = useState("");

  // Queries
  const officesQuery = useManagedOffices();
  const departmentsQuery = useManagedDepartments(effectiveOfficeId, showArchived);
  
  // Form-specific query to ensure we have departments for whatever office is selected in the form
  const formDepartmentsQuery = useManagedDepartments(form.office_id || undefined, false);

  const servicesQuery = useManagedServicesList(effectiveOfficeId, showArchived, search);

  const hostsQuery = useHosts({
    officeId: form.office_id || undefined,
    departmentId: form.department_id || undefined,
    limit: 500,
  });

  // Mutations
  const createMutation = useCreateManagedService();
  const updateMutation = useUpdateManagedService();
  const deleteMutation = useDeleteManagedService();
  const restoreMutation = useRestoreManagedService();

  // Service List Processing
  const services = useMemo(() => servicesQuery.data?.services ?? [], [servicesQuery.data]);
  
  const filtered = useMemo(() => {
    return services.filter((s: any) => {
      // Coerce BIGINT strings to numbers for reliable comparison
      if (departmentFilter && Number(s.department_id) !== Number(departmentFilter)) return false;
      if (officeFilter && Number(s.office_id) !== Number(officeFilter)) return false;
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [services, departmentFilter, officeFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
  const paginated = useMemo(() => filtered.slice((page - 1) * limit, page * limit), [filtered, page]);

  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setForm({
      name: "",
      office_id: effectiveOfficeId ?? 0,
      department_id: 0,
      duration_minutes: 30,
      host_ids: [],
    });
  }, [effectiveOfficeId]);

  const startEdit = (service: any) => {
    setEditingId(service.id);
    setForm({
      name: service.name,
      office_id: Number(service.office_id),
      department_id: Number(service.department_id),
      duration_minutes: Number(service.duration_minutes),
      host_ids: service.hosts?.map((h: any) => h.id) || [],
    });
  };

  const groupedHosts = useMemo(() => {
    // `hostsQuery.data` may be an array (legacy) or a paginated wrapper { data, meta }.
    // Normalize to an array for downstream code.
    const hosts = Array.isArray(hostsQuery.data) ? hostsQuery.data : (hostsQuery.data?.data ?? []);
    const groups: Record<string, any[]> = {};
    
    // Filter hosts by selected office AND department
    const officeHosts = hosts.filter((h: any) => {
      const hOfficeId = h.office_id || h.office?.id || h.Office?.id;
      const hDeptId = h.department_id || h.department?.id || h.Department?.id;

      const officeMatch = !form.office_id || Number(hOfficeId) === Number(form.office_id);
      const deptMatch = !form.department_id || Number(hDeptId) === Number(form.department_id);
      return officeMatch && deptMatch;
    });

    officeHosts.forEach((h: any) => {
      const deptName = h.department?.name || h.Department?.name || "Unassigned";
      if (!groups[deptName]) groups[deptName] = [];
      groups[deptName].push(h);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [hostsQuery.data, form.office_id, form.department_id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.office_id === 0 || form.department_id === 0) {
      toast.error("Please select an office and department.");
      return;
    }

    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, payload: form });
        toast.success("Service updated.");
      } else {
        await createMutation.mutateAsync(form);
        toast.success("Service created.");
        updateUrl({ page: "1" }); // Jump to page 1 to see the new service
      }
      resetForm();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to save service.");
    }
  };
  return (
    <div className="space-y-8">
      <section className="ui-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-content-base">Service Catalog</h1>
            <p className="mt-3 text-content-muted">Manage appointment types and assignments.</p>
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
          void servicesQuery.refetch();
        }}
      />

      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] items-start">
        <section className="ui-card ui-card-elevated">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-content-base">Service records</h2>
              <div className="flex bg-surface-background p-1 mt-4 w-fit rounded-xl border border-surface-border">
                <button
                  onClick={() => updateUrl({ status: null, page: "1" })}
                  className={clsx("px-4 py-1.5 text-xs font-bold rounded-lg transition", !showArchived ? "bg-surface-overlay text-content-base shadow-sm" : "text-content-dimmed")}
                >
                  Active
                </button>
                <button
                  onClick={() => updateUrl({ status: "archived", page: "1" })}
                  className={clsx("px-4 py-1.5 text-xs font-bold rounded-lg transition", showArchived ? "bg-surface-overlay text-content-base shadow-sm" : "text-content-dimmed")}
                >
                  Archived
                </button>
              </div>
            </div>
            <div className="rounded-2xl-enterprise border border-surface-border bg-surface-background/80 px-4 py-3 text-right">
              <p className="text-xs uppercase tracking-[0.24em] text-content-dimmed">Total Visible</p>
              <p className="mt-1 text-2xl font-semibold text-content-base">{filtered.length}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center">
            <input
              type="search"
              placeholder="Search..."
              value={search}
              onChange={(e) => updateUrl({ q: e.target.value || null, page: "1" })}
              className="ui-input flex-1"
            />
            
            <select
              value={officeFilter ?? 0}
              onChange={(e) => updateUrl({ office_id: e.target.value !== "0" ? e.target.value : null, department_id: null, page: "1" })}
              className="ui-input w-full md:w-48"
              disabled={officeScopedAdmin}
            >
              <option value={0}>All Offices</option>
              {officesQuery.data?.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>

            <select
              value={departmentFilter ?? 0}
              onChange={(e) => updateUrl({ department_id: e.target.value !== "0" ? e.target.value : null, page: "1" })}
              className="ui-input w-full md:w-48"
            >
              <option value={0}>All Departments</option>
              {departmentsQuery.data
                ?.filter((d: any) => !effectiveOfficeId || Number(d.office_id) === Number(effectiveOfficeId))
                .map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>


          <div className="mt-8 space-y-4">
            {servicesQuery.isLoading ? (
              [1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl-enterprise bg-surface-overlay/70" />)
            ) : (
              <AnimatePresence mode="popLayout">
                {paginated.map((s: any, idx: number) => (
                  <motion.article 
                    key={s.id} 
                    layout
                    initial={{ opacity: 0, y: 20, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ 
                      duration: 0.3, 
                      delay: idx * 0.05,
                      ease: "easeOut" 
                    }}
                    whileHover={{ scale: 1.01, translateY: -2 }}
                    className={clsx(
                      "rounded-2xl-enterprise border border-surface-border bg-surface-card/70 p-5 hover:border-brand-primary/30 hover:bg-surface-card transition-colors group cursor-pointer shadow-lg shadow-black/20",
                      expandedServiceId === Number(s.id) && "border-brand-primary/40 bg-surface-card ring-1 ring-brand-primary/10"
                    )}
                    onClick={() => {
                      const id = Number(s.id);
                      if (expandedServiceId === id) {
                        setExpandedServiceId(null);
                        setIsAssigningHosts(false);
                      } else {
                        setExpandedServiceId(id);
                      }
                    }}
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <div className={clsx(
                            "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                            expandedServiceId === Number(s.id) ? "bg-brand-primary/20 text-brand-accent" : "bg-surface-overlay text-content-dimmed"
                          )}>
                            {expandedServiceId === Number(s.id) ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                          </div>
                          <div>
                            <h2 className="text-lg font-semibold text-content-base group-hover:text-brand-accent transition-colors">{s.name}</h2>
                            <p className="text-sm text-content-muted mt-1">{s.duration_minutes} mins · {s.Department?.name || s.department?.name || 'No Dept'} ({s.Office?.name || s.office?.name || 'No Office'})</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                           <span className={clsx("rounded-full border px-3 py-1 text-[10px] uppercase tracking-widest", s.deleted_at ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300")}>
                            {s.deleted_at ? "Archived" : "Active"}
                          </span>
                        </div>
                      </div>
                      
                      {expandedServiceId === Number(s.id) && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="border-t border-surface-border pt-4 mt-2 space-y-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-content-dimmed flex items-center gap-2">
                              <Users className="h-4 w-4 text-brand-primary/60" />
                              Assigned Hosts
                            </h3>
                            <button 
                              onClick={() => setIsAssigningHosts(!isAssigningHosts)}
                              className={clsx(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all shadow-sm",
                                isAssigningHosts 
                                  ? "bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20" 
                                  : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                              )}
                            >
                              {isAssigningHosts ? <X className="h-3.5 w-3.5" /> : <Settings className="h-3.5 w-3.5" />}
                              {isAssigningHosts ? "Finish Management" : "Manage Hosts"}
                            </button>
                          </div>

                          {isAssigningHosts ? (
                            <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                              <div className="relative">
                                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-content-dimmed" />
                                <input 
                                  type="text"
                                  placeholder="Search hosts to assign..."
                                  value={hostSearch}
                                  onChange={(e) => setHostSearch(e.target.value)}
                                  className="w-full bg-surface-background/50 border border-surface-border rounded-xl py-2.5 pl-10 pr-4 text-xs text-content-base placeholder:text-content-dimmed focus:outline-none focus:border-brand-primary/50"
                                />
                              </div>
                              <div className="max-h-60 overflow-y-auto ui-scrollbar pr-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {((Array.isArray(hostsQuery.data) ? hostsQuery.data : hostsQuery.data?.data) ?? [])
                                  .filter((h: any) => {
                                    const name = h.user?.full_name || h.name || "";
                                    return name.toLowerCase().includes(hostSearch.toLowerCase());
                                  })
                                  .map((host: any) => {
                                    const isLinked = s.hosts?.some((h: any) => Number(h.id) === Number(host.id));
                                    return (
                                      <button
                                        key={host.id}
                                        disabled={updateMutation.isPending}
                                        onClick={async () => {
                                          const currentIds = s.hosts?.map((h: any) => Number(h.id)) || [];
                                          const nextIds = isLinked 
                                            ? currentIds.filter((id: number) => id !== Number(host.id))
                                            : [...currentIds, Number(host.id)];
                                          
                                          try {
                                            await updateMutation.mutateAsync({ 
                                              id: Number(s.id), 
                                              payload: { host_ids: nextIds } 
                                            });
                                            toast.success(`Updated assignments for ${s.name}`);
                                          } catch (err) {
                                            toast.error("Failed to update host assignments");
                                          }
                                        }}
                                        className={clsx(
                                          "flex items-center justify-between p-2.5 rounded-xl border text-left transition-all",
                                          isLinked 
                                            ? "bg-brand-primary/10 border-brand-primary/30 text-brand-accent shadow-sm shadow-brand-primary/5" 
                                            : "bg-surface-overlay/30 border-surface-border text-content-muted hover:bg-surface-overlay"
                                        )}
                                      >
                                        <div className="flex items-center gap-2 overflow-hidden">
                                          <div className="h-6 w-6 rounded-full bg-surface-background flex items-center justify-center text-[10px] font-bold text-content-dimmed border border-surface-border">
                                            {(host.user?.full_name || "?").charAt(0)}
                                          </div>
                                          <span className="text-[10px] font-medium truncate">{host.user?.full_name || "Unknown"}</span>
                                        </div>
                                        {isLinked ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Plus className="h-3.5 w-3.5 shrink-0 opacity-40" />}
                                      </button>
                                    );
                                  })}
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {s.hosts && s.hosts.length > 0 ? (
                                s.hosts.map((h: any) => (
                                  <div key={h.id} className="group/host relative">
                                    <span className="inline-flex items-center gap-2 rounded-full bg-surface-overlay px-3 py-1.5 text-[10px] font-medium text-content-base border border-surface-border hover:border-brand-primary/40 hover:bg-brand-primary/5 transition-all">
                                      <div className="h-4 w-4 rounded-full bg-brand-primary/20 flex items-center justify-center text-[8px] font-bold text-brand-accent">
                                        {(h.user?.full_name || "?").charAt(0)}
                                      </div>
                                      {h.user?.full_name || h.name}
                                    </span>
                                  </div>
                                ))
                              ) : (
                                <div className="flex flex-col items-center justify-center py-8 w-full opacity-40 bg-surface-overlay/30 rounded-2xl border border-dashed border-surface-border">
                                  <Users className="h-8 w-8 mb-2" />
                                  <p className="text-xs italic font-medium">No hosts assigned to this service</p>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="flex gap-2 border-t border-surface-border pt-4">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                startEdit(s);
                              }} 
                              className="ui-btn ui-btn-secondary flex-1 py-2 text-xs flex items-center justify-center gap-2"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Full Edit
                            </button>
                            {s.deleted_at ? (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  restoreMutation.mutate(s.id);
                                }} 
                                className="ui-btn ui-btn-primary px-4 py-2 text-xs"
                              >
                                Restore
                              </button>
                            ) : (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteMutation.mutate(s.id);
                                }} 
                                className="ui-btn ui-btn-danger px-4 py-2 text-xs"
                              >
                                Archive
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )}

                      {!expandedServiceId || expandedServiceId !== Number(s.id) ? (
                         <div className="flex items-center justify-between border-t border-surface-border/50 pt-3">
                            <div className="flex flex-wrap gap-1.5">
                              {s.hosts?.slice(0, 3).map((h: any) => (
                                <span key={h.id} className="inline-flex items-center gap-1 rounded-md bg-brand-primary/10 px-2 py-0.5 text-[10px] text-brand-accent border border-brand-primary/10">
                                  {h.user?.full_name || h.name}
                                </span>
                              ))}
                              {s.hosts?.length > 3 && (
                                <span className="text-[10px] text-content-dimmed font-medium">+{s.hosts.length - 3} more</span>
                              )}
                              {(!s.hosts || s.hosts.length === 0) && (
                                <span className="text-[10px] text-content-dimmed italic">No hosts</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] font-bold text-brand-primary uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                               View Details <ChevronDown className="h-3 w-3" />
                            </div>
                         </div>
                      ) : null}
                    </div>
                  </motion.article>
                ))}
              </AnimatePresence>
            )}
            {!servicesQuery.isLoading && paginated.length === 0 && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-12 text-content-dimmed"
              >
                No services found matching filters.
              </motion.div>
            )}
          </div>

          <div className="mt-6">
            <PaginationControls
              page={page}
              totalPages={totalPages}
              onPageChange={(p) => updateUrl({ page: String(p) })}
              hasNext={page < totalPages}
              hasPrevious={page > 1}
              isLoading={servicesQuery.isFetching}
            />
          </div>
        </section>

        <form onSubmit={submit} className="ui-card ui-card-elevated flex flex-col gap-6 self-start sticky top-24">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl-enterprise bg-brand-primary/10 text-brand-accent">
              <ShieldPlus className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-content-base">{editingId ? "Edit Service" : "Define Service"}</h3>
              <p className="text-sm text-content-muted">Configure service details and assignments.</p>
            </div>
          </div>

          <div className="space-y-4">
            <Field label="Service Name">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="ui-input" required />
            </Field>

            <Field label="Duration (Minutes)">
              <input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} className="ui-input" required />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Office">
                <select
                  value={form.office_id}
                  onChange={(e) => setForm({ ...form, office_id: Number(e.target.value), department_id: 0 })}
                  className="ui-input"
                  required
                  disabled={officeScopedAdmin}
                >
                  <option value={0}>Select Office</option>
                  {officesQuery.data?.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </Field>

              <Field label="Department">
                <select
                  value={form.department_id}
                  onChange={(e) => setForm({ ...form, department_id: Number(e.target.value) })}
                  className="ui-input"
                  required
                >
                  <option value={0}>Select Department</option>
                  {formDepartmentsQuery.data
                    ?.filter((d: any) => Number(d.office_id) === Number(form.office_id))
                    .map((d: any) => <option key={d.id} value={Number(d.id)}>{d.name}</option>)}
                </select>
              </Field>
            </div>

            <Field label="Assign Hosts">
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-content-dimmed" />
                  <input 
                    type="text"
                    placeholder="Search hosts..."
                    value={assignmentSearch}
                    onChange={(e) => setAssignmentSearch(e.target.value)}
                    className="ui-input pl-10 text-sm"
                  />
                </div>
                
                <div className="max-h-64 overflow-y-auto rounded-xl border border-surface-border bg-surface-background/50 p-4 space-y-4 ui-scrollbar shadow-inner">
                  {hostsQuery.isLoading ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-2">
                       <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
                       <p className="text-xs text-content-dimmed">Loading hosts...</p>
                    </div>
                  ) : null}
                  {!hostsQuery.isLoading && groupedHosts.length === 0 ? (
                    <div className="text-center py-8">
                       <Users className="h-8 w-8 mx-auto mb-2 opacity-20 text-content-dimmed" />
                       <p className="text-xs text-content-dimmed font-medium">No hosts found for selected filters.</p>
                    </div>
                  ) : null}
                  {groupedHosts.map(([deptName, hosts]) => {
                    const filteredGroupHosts = hosts.filter((h: any) => 
                      (h.user?.full_name || "").toLowerCase().includes(assignmentSearch.toLowerCase())
                    );
                    
                    if (filteredGroupHosts.length === 0) return null;

                    return (
                      <div key={deptName} className="space-y-2">
                        <div className="flex items-center gap-2 border-b border-surface-border/50 pb-1">
                          <Briefcase className="h-3 w-3 text-brand-accent/50" />
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-content-dimmed">{deptName}</h4>
                        </div>
                        <div className="grid grid-cols-1 gap-1">
                          {filteredGroupHosts.map((h: any) => {
                            const isChecked = form.host_ids.includes(Number(h.id));
                            return (
                              <label 
                                key={h.id} 
                                className={clsx(
                                  "flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer group",
                                  isChecked 
                                    ? "bg-brand-primary/5 border-brand-primary/20 text-brand-accent" 
                                    : "bg-transparent border-transparent text-content-muted hover:bg-surface-overlay/50"
                                )}
                              >
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      const id = Number(h.id);
                                      setForm(f => ({ ...f, host_ids: e.target.checked ? [...f.host_ids, id] : f.host_ids.filter(i => i !== id) }));
                                    }}
                                    className="rounded border-surface-border bg-surface-background text-brand-primary focus:ring-brand-primary"
                                  />
                                  <span className="text-xs font-medium truncate">{h.user?.full_name || h.name || "Unknown"}</span>
                                </div>
                                {isChecked && <Check className="h-3.5 w-3.5 text-brand-accent shrink-0" />}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Field>
          </div>

          <div className="flex gap-3">
            <button type="submit" className="ui-btn ui-btn-primary flex-1 py-3 font-semibold">{editingId ? "Save changes" : "Create service"}</button>
            {editingId && <button type="button" onClick={resetForm} className="ui-btn ui-btn-secondary px-6 py-3 text-sm">Cancel</button>}
          </div>
        </form>
      </div>
    </div>
  );
}
