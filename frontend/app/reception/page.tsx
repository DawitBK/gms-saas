"use client";

import Link from "next/link";
import { type ComponentType, useMemo, useState } from "react";
import {
  CalendarDays,
  DoorOpen,
  FileText,
  Loader2,
  QrCode,
  Route,
  ShieldCheck,
  Sparkles,
  User,
  UserRoundCheck,
  Users,
  CreditCard,
  Camera,
  Check,
  Upload,
  Clock,
} from "lucide-react";
import PaginationControls from "@shared/components/PaginationControls";
import { MetricCard } from "@shared/components/ui/MetricCard";
import { SectionHeader } from "@shared/components/ui/SectionHeader";
import { Field } from "@shared/components/ui/Field";
import { CameraScanner } from "@shared/components/ui/CameraScanner";
import { useScanDocument } from "@features/ocr/hooks";
import { toast } from "sonner";
import { useVisitDecision } from "@features/approvals/hooks";
import { useRevokeVisitCredential } from "@features/credentials/hooks";
import { OperationsDashboard } from "@features/operations/components/OperationsDashboard";
import { OperationsAnalytics } from "@features/operations/components/OperationsAnalytics";
import { OperationsQueue } from "@features/operations/components/OperationsQueue";
import { OperationsActivity } from "@features/operations/components/OperationsActivity";
import { useOperationsDashboard } from "@features/operations/hooks";
import { useVisitNotifications } from "@shared/hooks/useVisitNotifications";
import {
  useVisitsList,
  useCreateVisit,
  useCheckInVisit,
} from "@features/visits/hooks";
import {
  useOffices,
  useDepartments,
  useServices,
  useTimeSlots,
} from "@features/catalog/hooks";
import { useOfficeRealtime } from "@shared/hooks/useOfficeRealtime";
import { useManagementStore } from "@state/management.store";
import { ManagementPanel } from "@shared/components/ManagementPanel";
import { StatusBadge } from "@shared/components/ui/StatusBadge";
import {
  filterFutureTimeSlots,
  formatTimeSlotDate,
  formatTimeSlotWindow,
} from "@shared/lib/time-slots";
import { DatePicker } from "@shared/components/ui/DatePicker";
import { startOfToday } from "date-fns";
import { LiveDemoButton } from "@shared/components/LiveDemoButton";

export default function ReceptionDashboardPage() {
  useVisitNotifications();
  const [hostQuery, setHostQuery] = useState("");
  const [page, setPage] = useState(1);
  const limit = 5;
  const { data, isLoading, isError, error, refetch } = useOperationsDashboard();
  const { isOpen } = useManagementStore();
  const visitsQuery = useVisitsList({ page, limit });
  const checkInMutation = useCheckInVisit();
  const visits = useMemo(
    () => visitsQuery.data?.data ?? [],
    [visitsQuery.data],
  );
  const visitsLoading = visitsQuery.isLoading;
  const hasNextPage = page < (visitsQuery.data?.meta?.totalPages ?? 1);
  const decisionMutation = useVisitDecision();
  const revokeMutation = useRevokeVisitCredential();
  const { open } = useManagementStore();
  const prioritizedVisits = useMemo(() => {
    const statusRank: Record<string, number> = {
      ESCALATED: 0,
      PENDING: 1,
      APPROVED: 2,
      CHECKED_IN: 3,
      IN_PROGRESS: 4,
      RESCHEDULED: 5,
      REASSIGNED: 6,
      REASSIGNED_RESCHEDULED: 7,
      COMPLETED: 8,
      DECLINED: 9,
      CANCELLED: 10,
      NO_SHOW: 11,
      EXPIRED: 12,
    };

    return [...visits].sort((left, right) => {
      const leftRank = statusRank[left.status] ?? 99;
      const rightRank = statusRank[right.status] ?? 99;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return (
        new Date(right.updated_at).getTime() -
        new Date(left.updated_at).getTime()
      );
    });
  }, [visits]);
  const filteredVisits = useMemo(() => {
    const normalizedQuery = hostQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return prioritizedVisits;
    }

    return prioritizedVisits.filter((visit) => {
      const hostName = visit.host?.name?.toLowerCase() ?? "";
      const hostEmail = visit.host?.email?.toLowerCase() ?? "";
      const guestName = visit.guest?.name?.toLowerCase() ?? "";
      const guestEmail = visit.guest?.email?.toLowerCase() ?? "";
      const serviceName = visit.service?.name?.toLowerCase() ?? "";
      const departmentName = visit.department?.name?.toLowerCase() ?? "";

      return (
        hostName.includes(normalizedQuery) ||
        hostEmail.includes(normalizedQuery) ||
        guestName.includes(normalizedQuery) ||
        guestEmail.includes(normalizedQuery) ||
        serviceName.includes(normalizedQuery) ||
        departmentName.includes(normalizedQuery)
      );
    });
  }, [hostQuery, prioritizedVisits]);

  const pending = useMemo(
    () => filteredVisits.filter((visit) => visit.status === "PENDING"),
    [filteredVisits],
  );
  const ready = useMemo(
    () => filteredVisits.filter((visit) => visit.status === "APPROVED"),
    [filteredVisits],
  );
  const onsite = useMemo(
    () => filteredVisits.filter((visit) => visit.status === "CHECKED_IN"),
    [filteredVisits],
  );
  const escalated = useMemo(
    () =>
      filteredVisits.filter((visit) => visit.routing.escalated_to_reception),
    [filteredVisits],
  );
  const officeIds = useMemo(
    () =>
      visits.map(
        (visit) =>
          visit.office?.id ??
          visit.service?.office_id ??
          visit.department?.office_id ??
          null,
      ),
    [visits],
  );

  const [triageForm, setTriageForm] = useState({
    office_id: "",
    department_id: "",
    service_id: "",
    host_id: "",
    time_slot_id: "",
    date: new Date().toISOString().slice(0, 10),
    purpose: "",
    guest_name: "",
    guest_email: "",
    guest_phone: "",
    guest_company: "",
    government_id: "",
    document_url: "",
  });
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const scanMutation = useScanDocument();

  const officeIdTriage = triageForm.office_id
    ? Number(triageForm.office_id)
    : undefined;
  const serviceIdTriage = triageForm.service_id
    ? Number(triageForm.service_id)
    : undefined;
  const departmentIdTriage = triageForm.department_id
    ? Number(triageForm.department_id)
    : undefined;
  const hostIdTriage = triageForm.host_id
    ? Number(triageForm.host_id)
    : undefined;

  const officesTriage = useOffices();
  const departmentsTriage = useDepartments(officeIdTriage);
  const servicesTriage = useServices(officeIdTriage);
  const triageDepartmentId = serviceIdTriage
    ? servicesTriage.data?.find((service) => Number(service.id) === Number(serviceIdTriage))
        ?.department_id
    : departmentIdTriage;

  const availabilityTriage = useTimeSlots({
    officeId: officeIdTriage,
    serviceId: serviceIdTriage,
    departmentId: triageDepartmentId,
    hostId: hostIdTriage,
    date: triageForm.date,
  });

  const triageHosts = availabilityTriage.data?.hosts ?? [];
  const triageSlots = useMemo(
    () => filterFutureTimeSlots(availabilityTriage.data?.slots ?? []),
    [availabilityTriage.data?.slots],
  );

  const createVisitMutation = useCreateVisit();

  useOfficeRealtime(officeIds);

  const handleTriageSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const office_id = officeIdTriage;
    const service_id = serviceIdTriage;
    const department_id = triageDepartmentId;
    const time_slot_id = triageForm.time_slot_id
      ? Number(triageForm.time_slot_id)
      : undefined;
    const host_id = hostIdTriage;

    if (!office_id || (!department_id && !service_id) || !time_slot_id) {
      toast.error(
        "Please pick an office, " + (!department_id && !service_id ? "department or service, " : "") + "and an available time slot for triage booking.",
      );
      return;
    }

    if (!triageForm.guest_name.trim() || !triageForm.guest_email.trim()) {
      toast.error("Please capture the guest name and email before booking.");
      return;
    }

    createVisitMutation.mutate(
      {
        office_id,
        department_id,
        time_slot_id,
        ...(service_id ? { service_id } : {}),
        ...(host_id ? { host_id } : {}),
        guest_payload: {
          full_name: triageForm.guest_name.trim(),
          email: triageForm.guest_email.trim(),
          ...(triageForm.guest_phone.trim()
            ? { phone: triageForm.guest_phone.trim() }
            : {}),
          ...(triageForm.guest_company.trim()
            ? { company: triageForm.guest_company.trim() }
            : {}),
          ...(triageForm.government_id.trim()
            ? { government_id: triageForm.government_id.trim() }
            : {}),
          ...(triageForm.document_url.trim()
            ? { document_url: triageForm.document_url.trim() }
            : {}),
        },
        ...(triageForm.purpose.trim()
          ? { purpose: triageForm.purpose.trim() }
          : {}),
      },
      {
        onSuccess: (visit) => {
          toast.success(`Triage visit created: #${visit.id}`);
          setTriageForm({
            office_id: "",
            department_id: "",
            service_id: "",
            host_id: "",
            time_slot_id: "",
            date: new Date().toISOString().slice(0, 10),
            purpose: "",
            guest_name: "",
            guest_email: "",
            guest_phone: "",
            guest_company: "",
            government_id: "",
            document_url: "",
          });
        },
        onError: (error: any) => {
          toast.error(
            error?.response?.data?.error?.message ??
              "Failed to create triage visit.",
          );
        },
      },
    );
  };

  const decide = (visitId: number, decision: "APPROVED" | "DECLINED") => {
    decisionMutation.mutate(
      { visitId, decision },
      {
        onSuccess: () => {
          toast.success(
            `${visitId} ${decision === "APPROVED" ? "approved" : "declined"}.`,
          );
        },
        onError: (error: any) => {
          toast.error(
            error?.response?.data?.error?.message ?? "Unable to update visit.",
          );
        },
      },
    );
  };

  const handleManualCheckIn = (visit: any) => {
    if (!visit.qr_code) {
      toast.error("Visit does not have a valid QR credential for check-in.");
      return;
    }

    toast.promise(
      checkInMutation.mutateAsync({
        qrCode: visit.qr_code,
        manualOverride: true,
      }),
      {
        loading: `Checking in ${visit.guest?.name || "guest"}...`,
        success: () => {
          void visitsQuery.refetch();
          return `Successfully checked in ${visit.guest?.name || "guest"}.`;
        },
        error: (err: any) =>
          err.response?.data?.error?.message ||
          "Failed to perform manual check-in.",
      },
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Reception Operations</h1>
        <LiveDemoButton />
      </div>
      {isError && (
        <div className="ui-card border-rose-500/30 bg-rose-500/10 p-4">
          <p className="text-rose-300">
            Error loading operations dashboard:{" "}
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
          <button
            onClick={() => refetch()}
            className="ui-btn ui-btn-secondary mt-2 text-xs"
          >
            Retry
          </button>
        </div>
      )}
      <section
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 items-start"
        aria-label="Reception metrics summary"
      >
        <MetricCard
          label="Pending approvals"
          value={data?.summary.pending_approvals ?? 0}
          icon={ShieldCheck}
          toneClassName="text-amber-400"
          href="/reception/visits?status=PENDING"
        />
        <MetricCard
          label="Approved visitors"
          value={
            data?.status_distribution.find((s) => s.status === "APPROVED")
              ?.count ?? 0
          }
          icon={DoorOpen}
          toneClassName="text-cyan-400"
          href="/reception/visits?status=APPROVED"
        />
        <MetricCard
          label="Currently onsite"
          value={
            data?.status_distribution.find((s) => s.status === "CHECKED_IN")
              ?.count ?? 0
          }
          icon={UserRoundCheck}
          toneClassName="text-emerald-400"
          href="/reception/visits?status=CHECKED_IN"
        />
        <MetricCard
          label="Expected Today"
          value={data?.summary.entries_today ?? 0}
          icon={Clock}
          toneClassName="text-rose-400"
          href="/reception/visits"
        />
      </section>

      <section
        className="ui-card ui-card-elevated relative z-50 overflow-visible"
        aria-label="Triage visit creation"
      >
        <SectionHeader
          title="Triage visit"
          titleClassName="text-xl"
          subtitle="Capture walk-in guest details, route them to the right office flow, and hand the request into the same scheduling pipeline used elsewhere."
        />
        <form
          onSubmit={handleTriageSubmit}
          className="mt-6 space-y-6"
          aria-label="Triage visit form"
        >
          <div className="rounded-3xl border border-cyan-500/20 bg-cyan-500/5 p-6">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-cyan-400" />
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
                  Guest Capture
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  Walk-in triage needs a real guest profile so the request,
                  notifications, and credentials land on the right person.
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Guest Name">
                <input
                  className="ui-input"
                  value={triageForm.guest_name}
                  onChange={(e) =>
                    setTriageForm((prev) => ({
                      ...prev,
                      guest_name: e.target.value,
                    }))
                  }
                  placeholder="Full name"
                />
              </Field>
              <Field label="Guest Email">
                <input
                  type="email"
                  className="ui-input"
                  value={triageForm.guest_email}
                  onChange={(e) =>
                    setTriageForm((prev) => ({
                      ...prev,
                      guest_email: e.target.value,
                    }))
                  }
                  placeholder="name@example.com"
                />
              </Field>
              <Field label="Guest Company" optional>
                <input
                  className="ui-input"
                  value={triageForm.guest_company}
                  onChange={(e) =>
                    setTriageForm((prev) => ({
                      ...prev,
                      guest_company: e.target.value,
                    }))
                  }
                  placeholder="Organization"
                />
              </Field>
              <Field label="ID Number / Passport" optional>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    className="ui-input pl-10"
                    value={triageForm.government_id}
                    onChange={(e) =>
                      setTriageForm((prev) => ({
                        ...prev,
                        government_id: e.target.value,
                      }))
                    }
                    placeholder="ID Number"
                  />
                </div>
              </Field>
              <Field label="ID Document Capture" optional>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-500/30 bg-cyan-500/5 py-3 text-sm font-semibold text-cyan-400 transition hover:bg-cyan-500/10"
                  >
                    <Camera className="h-4 w-4" />
                    Scan with Camera
                  </button>
                  {triageForm.document_url && (
                    <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 px-3 py-2 border border-emerald-500/20">
                      <p className="text-xs font-medium text-emerald-400 flex items-center gap-1.5">
                        <Check className="h-3.5 w-3.5" />
                        ID Document Captured
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setTriageForm((p) => ({ ...p, document_url: "" }))
                        }
                        className="text-[10px] text-rose-400 hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
              </Field>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] items-start">
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Office">
                  <select
                    className="ui-input"
                    value={triageForm.office_id}
                    onChange={(e) =>
                      setTriageForm((prev) => ({
                        ...prev,
                        office_id: e.target.value,
                        department_id: "",
                        service_id: "",
                        host_id: "",
                        time_slot_id: "",
                      }))
                    }
                  >
                    <option value="">Pick office</option>
                    {officesTriage.data?.map((office) => (
                      <option key={office.id} value={office.id}>
                        {office.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Service" optional>
                  <select
                    className="ui-input"
                    value={triageForm.service_id}
                    onChange={(e) =>
                      setTriageForm((prev) => ({
                        ...prev,
                        service_id: e.target.value,
                        department_id: "",
                        host_id: "",
                        time_slot_id: "",
                      }))
                    }
                    disabled={!officeIdTriage}
                  >
                    <option value="">Skip service</option>
                    {servicesTriage.data?.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Department">
                  <select
                    className="ui-input"
                    value={triageForm.department_id}
                    onChange={(e) =>
                      setTriageForm((prev) => ({
                        ...prev,
                        department_id: e.target.value,
                        host_id: "",
                        time_slot_id: "",
                      }))
                    }
                    disabled={!officeIdTriage || Boolean(serviceIdTriage)}
                  >
                    <option value="">
                      {serviceIdTriage
                        ? "Derived from service"
                        : "Pick department"}
                    </option>
                    {departmentsTriage.data?.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Arrival Date">
                  <DatePicker
                    value={triageForm.date}
                    minDate={startOfToday()}
                    onChange={(val) => {
                      if (val) {
                        setTriageForm((prev) => ({
                          ...prev,
                          date: val,
                          host_id: "",
                          time_slot_id: "",
                        }));
                      }
                    }}
                    disabled={!officeIdTriage}
                  />
                </Field>

                <Field
                  label="Preferred Host"
                  optional
                  className="md:col-span-2"
                >
                  <select
                    className="ui-input"
                    value={triageForm.host_id}
                    onChange={(e) =>
                      setTriageForm((prev) => ({
                        ...prev,
                        host_id: e.target.value,
                        time_slot_id: "",
                      }))
                    }
                    disabled={
                      !officeIdTriage ||
                      !triageForm.date ||
                      (!serviceIdTriage && !triageDepartmentId)
                    }
                  >
                    <option value="">Auto-assign best available host</option>
                    {triageHosts.map((host) => (
                      <option key={host.id} value={host.id}>
                        {host.name} ({host.available_slots_count} slots)
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Purpose" optional>
                <textarea
                  className="ui-input min-h-[110px]"
                  rows={4}
                  value={triageForm.purpose}
                  onChange={(e) =>
                    setTriageForm((prev) => ({
                      ...prev,
                      purpose: e.target.value,
                    }))
                  }
                  placeholder="Describe the guest request, urgency, or front-desk notes"
                />
              </Field>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Available slots
                    </p>
                    <p className="text-xs text-slate-500">
                      Only future slots are shown for the selected routing
                      context.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-xs text-slate-300">
                    <CalendarDays className="h-3.5 w-3.5 text-cyan-400" />
                    {new Date(triageForm.date).toLocaleDateString(undefined, {
                      dateStyle: "long",
                    })}
                  </div>
                </div>

                {availabilityTriage.isLoading ? (
                  <div className="flex min-h-40 items-center justify-center rounded-3xl border border-slate-800 bg-slate-950/50">
                    <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
                  </div>
                ) : triageSlots.length ? (
                  <div className="max-h-[24rem] space-y-3 overflow-y-auto ui-scrollbar pr-2">
                    {triageSlots.map((slot) => (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() =>
                          setTriageForm((prev) => ({
                            ...prev,
                            time_slot_id: String(slot.id),
                            host_id: String(slot.host_id),
                          }))
                        }
                        className={`flex w-full items-center justify-between gap-4 rounded-2xl border px-4 py-4 text-left transition ${
                          triageForm.time_slot_id === String(slot.id)
                            ? "border-cyan-500 bg-cyan-500/10 text-cyan-100"
                            : "border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700"
                        }`}
                      >
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {formatTimeSlotWindow(slot)}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {slot.host?.name ?? "Assigned host"} ·{" "}
                            {formatTimeSlotDate(slot)}
                          </p>
                        </div>
                        <span className="text-[11px] font-bold uppercase tracking-[0.2em]">
                          {triageForm.time_slot_id === String(slot.id)
                            ? "Selected"
                            : "Choose"}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-slate-800 bg-slate-950/60 p-8 text-center">
                    <Users className="mx-auto h-8 w-8 text-slate-600" />
                    <p className="mt-3 text-sm text-slate-400">
                      No future triage slots match the current office and
                      routing filters.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                <div className="flex items-center gap-3">
                  <Route className="h-5 w-5 text-cyan-400" />
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Routing preview
                    </h3>
                    <p className="text-xs text-slate-500">
                      Confirm what reception is sending downstream.
                    </p>
                  </div>
                </div>
                <div className="mt-5 space-y-3">
                  <TriageSummaryItem
                    icon={Sparkles}
                    label="Service"
                    value={
                      servicesTriage.data?.find(
                        (service) => Number(service.id) === Number(serviceIdTriage),
                      )?.name ?? "Not selected"
                    }
                  />
                  <TriageSummaryItem
                    icon={Route}
                    label="Department"
                    value={
                      triageDepartmentId
                        ? (departmentsTriage.data?.find(
                            (department) =>
                              Number(department.id) === Number(triageDepartmentId),
                          )?.name ?? "Derived from service")
                        : "Not selected"
                    }
                  />
                  <TriageSummaryItem
                    icon={Users}
                    label="Host"
                    value={
                      triageForm.host_id
                        ? (triageHosts.find(
                            (host) => host.id === Number(triageForm.host_id),
                          )?.name ?? "Selected from slot")
                        : "Auto-assign from available hosts"
                    }
                  />
                  <TriageSummaryItem
                    icon={CalendarDays}
                    label="Arrival window"
                    value={
                      triageForm.time_slot_id
                        ? (() => {
                            const selectedSlot = triageSlots.find(
                              (slot) =>
                                slot.id === Number(triageForm.time_slot_id),
                            );
                            return selectedSlot
                              ? formatTimeSlotWindow(selectedSlot)
                              : "Not selected";
                          })()
                        : "Not selected"
                    }
                  />
                  <TriageSummaryItem
                    icon={FileText}
                    label="Purpose"
                    value={triageForm.purpose.trim() || "Not captured yet"}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="ui-btn ui-btn-primary w-full rounded-2xl py-3 text-sm font-semibold"
                disabled={createVisitMutation.isPending}
              >
                {createVisitMutation.isPending
                  ? "Creating triage visit..."
                  : "Create triage visit"}
              </button>
            </div>
          </div>
        </form>
      </section>

      <section className="grid gap-6 xl:grid-cols-2 items-start">
        <div className="min-w-0">
          <OperationsAnalytics data={data} isLoading={isLoading} />
        </div>

        <div className="min-w-0 space-y-4">
          <Link
            href="/reception/checkin"
            className="ui-card ui-card-elevated block p-6 transition hover:border-slate-700"
          >
            <QrCode className="h-6 w-6 text-amber-300" />
            <h2 className="mt-4 text-lg font-semibold text-white">
              Open check-in console
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Scan credentials, admit guests, and handle manual QR entry.
            </p>
          </Link>

          <div className="ui-card ui-card-elevated">
            <SectionHeader
              title="Front desk fallback queue"
              titleClassName="text-lg"
              subtitle="Reception should be able to approve urgent walk-ins, admit approved guests, and revoke access if needed."
            />
            <label className="mt-4 flex flex-col gap-2 text-sm text-slate-400">
              Search incoming visitors
              <input
                type="search"
                value={hostQuery}
                onChange={(event) => setHostQuery(event.target.value)}
                placeholder="Search by guest, host, or service"
                className="ui-input"
                aria-label="Search reception queue by guest, host name, or service"
              />
            </label>

            {visitsLoading ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading reception actions...
              </div>
            ) : (
              <>
                <div className="mt-4 space-y-3 max-h-[500px] overflow-y-auto ui-scrollbar pr-2">
                  {filteredVisits.slice(0, 10).map((visit) => (
                    <article
                      key={visit.id}
                      data-testid={`reception-queue-visit-${visit.id}`}
                      className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 transition hover:border-slate-700"
                    >
                      <button
                        type="button"
                        className="w-full text-left bg-transparent block"
                        onClick={() => open("VISIT", visit.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="break-words font-medium text-white hover:text-amber-400 transition-colors">
                              {visit.guest?.name ??
                                (visit.reference_number ||
                                  `Visit #${visit.id}`)}
                            </p>
                            <p className="mt-1 text-sm text-slate-400">
                              {new Date(visit.scheduled_start).toLocaleString()}
                            </p>
                          </div>
                          <StatusBadge value={visit.status} />
                        </div>
                        <p className="mt-2 text-sm text-slate-500">
                          {visit.service?.name ?? "Service pending"} {"->"}{" "}
                          {visit.department?.name ?? "Department pending"}
                        </p>
                        <p className="mt-1 break-words text-sm text-slate-500">
                          Assigned host:{" "}
                          {visit.host?.name ?? "Host not assigned yet"}
                        </p>
                        {visit.routing.escalated_to_reception ? (
                          <p className="mt-1 text-sm text-amber-300">
                            Escalated:{" "}
                            {visit.routing.escalation_reason ??
                              "Needs front-desk action"}
                          </p>
                        ) : null}
                      </button>

                      <div
                        className="mt-4 flex flex-wrap gap-2 border-t border-slate-800/60 pt-3"
                        aria-label={`Reception actions for visit ${visit.id}`}
                      >
                        {visit.status === "PENDING" ? (
                          <>
                            <button
                              type="button"
                              data-testid={`reception-approve-${visit.id}`}
                              onClick={() => decide(visit.id, "APPROVED")}
                              className="ui-btn bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                              aria-label={`Approve visit for ${visit.guest?.name}`}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              data-testid={`reception-decline-${visit.id}`}
                              onClick={() => decide(visit.id, "DECLINED")}
                              className="ui-btn ui-btn-danger px-3 py-2 text-xs"
                              aria-label={`Decline visit for ${visit.guest?.name}`}
                            >
                              Decline
                            </button>
                          </>
                        ) : null}
                        {visit.status === "APPROVED" ? (
                          <button
                            type="button"
                            onClick={() => handleManualCheckIn(visit)}
                            disabled={checkInMutation.isPending}
                            className="ui-btn bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
                          >
                            {checkInMutation.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <UserRoundCheck className="h-3 w-3" />
                            )}
                            Manual Check-In
                          </button>
                        ) : null}
                        {visit.latest_credential?.status === "ACTIVE" ? (
                          <button
                            type="button"
                            data-testid={`reception-revoke-${visit.id}`}
                            onClick={() =>
                              revokeMutation.mutate(
                                {
                                  visitId: visit.id,
                                  reason: "front_desk_override",
                                },
                                {
                                  onSuccess: () =>
                                    toast.success(
                                      `Credential revoked for ${visit.reference_number || `visit #${visit.id}`}.`,
                                    ),
                                  onError: (error: any) =>
                                    toast.error(
                                      error?.response?.data?.error?.message ??
                                        "Unable to revoke credential.",
                                    ),
                                },
                              )
                            }
                            className="ui-btn px-3 py-2 text-xs border-amber-500/30 text-amber-200 hover:bg-amber-500/10"
                            aria-label={`Revoke access for ${visit.guest?.name}`}
                          >
                            Revoke access
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                  {filteredVisits.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-400">
                      No reception queue items match the current host search.
                    </div>
                  ) : null}
                </div>

                <PaginationControls
                  page={page}
                  onPageChange={setPage}
                  hasPrevious={page > 1}
                  totalPages={visitsQuery.data?.meta?.totalPages}
                  hasNext={hasNextPage}
                />
              </>
            )}
          </div>
        </div>
      </section>
      {isScannerOpen && (
        <CameraScanner
          onClose={() => setIsScannerOpen(false)}
          onCapture={async (base64) => {
            setIsScannerOpen(false);
            setTriageForm((prev) => ({ ...prev, document_url: base64 }));
            try {
              const result = await scanMutation.mutateAsync({ image: base64 });
              if (result.success && result.data) {
                const { extracted, watchlist } = result.data;

                if (watchlist.alerted) {
                  toast.error(`SECURITY ALERT: ${watchlist.reason}`, {
                    duration: 10000,
                  });
                }

                setTriageForm((prev) => ({
                  ...prev,
                  guest_name: extracted.full_name || prev.guest_name,
                  government_id: extracted.id_number || prev.government_id,
                }));

                if (watchlist.alerted) {
                  toast.warning(
                    "Proceed with caution: Scanned ID matches a restricted user profile.",
                  );
                } else {
                  toast.success("ID details extracted automatically.");
                }
              }
            } catch (err) {
              console.error("OCR extraction failed:", err);
              toast.error("Failed to extract ID details.");
            }
          }}
          title="Scan Guest ID"
        />
      )}
      <section className="grid gap-6 lg:grid-cols-2 items-start mt-12 pt-12 border-t border-slate-800">
        <OperationsQueue
          mode="reception"
          queue={data?.queue || []}
          isLoading={isLoading}
        />
        <OperationsActivity
          activity={data?.activity || []}
          isLoading={isLoading}
        />
      </section>

      {isOpen && <ManagementPanel />}
    </div>
  );
}

function TriageSummaryItem({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-cyan-400">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          {label}
        </p>
        <p className="mt-1 truncate text-sm text-white">{value}</p>
      </div>
    </div>
  );
}
