"use client";

import type { ComponentType, ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  MapPin,
  Route,
  Sparkles,
  Users,
  UserRound,
  X,
} from "lucide-react";
import {
  useDepartments,
  useOffices,
  useServices,
  useTimeSlots,
} from "@features/catalog/hooks";
import type {
  DepartmentOption,
  OfficeOption,
  ServiceOption,
  TimeSlotOption,
} from "@features/catalog/types";
import { useCreateVisit } from "@features/visits/hooks";
import { Field } from "@shared/components/ui/Field";
import {
  filterFutureTimeSlots,
  formatTimeSlotDate,
  formatTimeSlotWindow,
} from "@shared/lib/time-slots";
import { DatePicker } from "@shared/components/ui/DatePicker";
import dynamic from "next/dynamic";

const MapViewer = dynamic(() => import("@shared/components/MapViewer"), { ssr: false });

type BookingForm = {
  office_id: string;
  department_id: string;
  service_id: string;
  host_id: string;
  time_slot_id: string;
  purpose: string;
  guest_name?: string;
  guest_email?: string;
  guest_phone?: string;
  guest_company?: string;
};

const INITIAL_FORM: BookingForm = {
  office_id: "",
  department_id: "",
  service_id: "",
  host_id: "",
  time_slot_id: "",
  purpose: "",
  guest_name: "",
  guest_email: "",
  guest_phone: "",
  guest_company: "",
};

import { useRoleContext } from "@shared/hooks/useRoleContext";
import { isAdminRole, isHostRole, isReceptionRole } from "@shared/lib/roles";

export default function BookVisitPage() {
  const { effectiveRole } = useRoleContext();
  const canManage =
    isAdminRole(effectiveRole) ||
    isHostRole(effectiveRole) ||
    isReceptionRole(effectiveRole);

  const createVisitMutation = useCreateVisit();
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState<BookingForm>(INITIAL_FORM);
  const [date, setDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [createdVisitId, setCreatedVisitId] = useState<number | null>(null);
  const [showMap, setShowMap] = useState(false);

  const officeId = form.office_id ? Number(form.office_id) : undefined;
  const serviceId = form.service_id ? Number(form.service_id) : undefined;

  const officesQuery = useOffices();
  const departmentsQuery = useDepartments(officeId, { limit: 500 });
  const servicesQuery = useServices(officeId, { limit: 500 });

  const offices = useMemo(() => officesQuery.data ?? [], [officesQuery.data]);
  const departments = useMemo(
    () => departmentsQuery.data ?? [],
    [departmentsQuery.data],
  );
  const services = useMemo(
    () => servicesQuery.data ?? [],
    [servicesQuery.data],
  );

  const routedDepartmentId = serviceId
    ? services.find((service) => service.id === serviceId)?.department_id
    : form.department_id
      ? Number(form.department_id)
      : undefined;

  const availabilityQuery = useTimeSlots({
    officeId,
    serviceId,
    departmentId: routedDepartmentId,
    date,
  });

  const availability = availabilityQuery.data;
  const hosts = useMemo(() => availability?.hosts ?? [], [availability?.hosts]);
  const slots = useMemo(
    () => filterFutureTimeSlots(availability?.slots ?? []),
    [availability?.slots],
  );

  const selectedOffice = useMemo(
    () => offices.find((office) => Number(office.id) === officeId) ?? null,
    [officeId, offices],
  );
  const selectedService = useMemo(
    () => services.find((service) => Number(service.id) === serviceId) ?? null,
    [serviceId, services],
  );

  const selectedDepartment = useMemo(
    () =>
      departments.find(
        (department) => Number(department.id) === routedDepartmentId,
      ) ?? null,
    [departments, routedDepartmentId],
  );

  const selectedSlot = useMemo(
    () =>
      slots.find((slot) => Number(slot.id) === Number(form.time_slot_id)) ??
      null,
    [form.time_slot_id, slots],
  );
  const selectedHost = useMemo(
    () =>
      hosts.find((host) => host.id === Number(selectedSlot?.host_id || 0)) ??
      null,
    [hosts, selectedSlot],
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const payload: any = {
      office_id: Number(form.office_id),
      department_id: Number(routedDepartmentId),
      time_slot_id: Number(form.time_slot_id),
      service_id: Number(form.service_id),
      ...(form.purpose.trim() ? { purpose: form.purpose.trim() } : {}),
    };

    const required = [
      payload.office_id,
      payload.service_id,
      payload.time_slot_id,
    ];
    if (canManage && form.guest_email && form.guest_name) {
      payload.guest_payload = {
        full_name: form.guest_name,
        email: form.guest_email,
        phone: form.guest_phone,
        company: form.guest_company,
      };
    }

    const ok = required.every((value) => Number.isFinite(value) && value > 0);
    if (!ok) {
      setError("Select an office, service, and available slot before booking.");
      return;
    }

    if (canManage && (!form.guest_name?.trim() || !form.guest_email?.trim())) {
      setError("Please provide a guest name and email to proceed.");
      return;
    }

    createVisitMutation.mutate(payload, {
      onSuccess: (visit) => {
        const id = (visit as { id?: number | string } | undefined)?.id;
        setCreatedVisitId(id ? Number(id) : -1);
      },
      onError: (mutationError: any) => {
        const backendError = mutationError?.response?.data?.error;
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
        setError(
          mutationError?.response?.data?.error?.message ??
            mutationError?.response?.data?.message ??
            "We could not create your visit right now. Please try again.",
        );
      },
    });
  };

  const openDatePicker = () => {
    const input = dateInputRef.current;
    if (!input) return;

    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }

    input.focus();
    input.click();
  };

  if (createdVisitId) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-16">
        <section className="rounded-[2rem] border border-emerald-500/20 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.22),_transparent_38%),linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(2,6,23,1))] p-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15">
            <CheckCircle2 className="h-7 w-7 text-emerald-300" />
          </div>
          <p className="mt-6 text-xs uppercase tracking-[0.35em] text-emerald-200/70">
            Visit routed successfully
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Your request is in the workflow.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            {createdVisitId > 0
              ? `Your visit was created. You can now track the routed department, assigned host, approval progress, and manual lifecycle updates from the visit tracker.`
              : "Your visit request was created. You can now track the routed department, assigned host, approval progress, and manual lifecycle updates from the visit tracker."}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/dashboard/visits"
              className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
            >
              Open visit tracker
              <ArrowRight className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={() => {
                setCreatedVisitId(null);
                setForm(INITIAL_FORM);
                setDate(new Date().toISOString().slice(0, 10));
              }}
              className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/70 px-5 py-3 text-sm text-slate-200 transition hover:border-slate-600 hover:text-white"
            >
              Book another visit
            </button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4 items-start">
          <SummaryCard
            label="Office"
            value={selectedOffice?.name ?? "Selected earlier"}
            icon={Building2}
          />
          <SummaryCard
            label="Department"
            value={selectedDepartment?.name ?? "Routed during booking"}
            icon={Route}
          />
          <SummaryCard
            label="Service"
            value={selectedService?.name ?? "Selected earlier"}
            icon={Sparkles}
          />
          <SummaryCard
            label="Assigned host"
            value={
              selectedHost?.name ??
              selectedSlot?.host?.name ??
              "Auto-assigned by system"
            }
            icon={Users}
          />
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-16">
      <section className="ui-hero">
        <p className="text-xs uppercase tracking-[0.35em] text-slate-500">
          Guest booking
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Book a visit with clear routing from service to host.
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
          Choose the office and service, the department is routed automatically.
          Then pick an available future host slot to submit your request.
        </p>
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_0.9fr] items-start">
        <section className="ui-card ui-card-elevated relative z-50">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Booking details
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Each step stays visible so the routing is easy to understand and
                test.
              </p>
            </div>
            <CalendarPlus className="h-5 w-5 text-cyan-400" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-8">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Field label="Target Office" error={fieldErrors.office_id}>
                    <select
                      value={form.office_id}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          office_id: e.target.value,
                          service_id: "",
                          time_slot_id: "",
                        })
                      }
                      className="ui-input"
                      required
                    >
                      <option value="">Select office</option>
                      {offices.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                {selectedOffice?.latitude !== undefined && selectedOffice?.longitude !== undefined && (
                  <button
                    type="button"
                    onClick={() => setShowMap(true)}
                    className="flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition"
                    title="View Location on Map"
                  >
                    <MapPin className="h-5 w-5" />
                  </button>
                )}
              </div>

              <Field label="Service Offering" error={fieldErrors.service_id}>
                <select
                  value={form.service_id}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      service_id: e.target.value,
                      time_slot_id: "",
                    })
                  }
                  className="ui-input"
                  required
                  disabled={!form.office_id}
                >
                  <option value="">Select service</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {canManage && (
              <div className="rounded-3xl border border-cyan-500/20 bg-cyan-500/5 p-6">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-cyan-400">
                  Guest Information
                </h3>
                <div className="grid gap-6 md:grid-cols-2">
                  <Field label="Guest Name" error={fieldErrors.guest_name}>
                    <input
                      value={form.guest_name}
                      onChange={(e) =>
                        setForm({ ...form, guest_name: e.target.value })
                      }
                      className="ui-input"
                      placeholder="Full Name"
                    />
                  </Field>
                  <Field label="Guest Email" error={fieldErrors.guest_email}>
                    <input
                      type="email"
                      value={form.guest_email}
                      onChange={(e) =>
                        setForm({ ...form, guest_email: e.target.value })
                      }
                      className="ui-input"
                      placeholder="Email Address"
                    />
                  </Field>
                  <Field
                    label="Guest Phone"
                    optional
                    error={fieldErrors.guest_phone}
                  >
                    <input
                      value={form.guest_phone}
                      onChange={(e) =>
                        setForm({ ...form, guest_phone: e.target.value })
                      }
                      className="ui-input"
                      placeholder="Phone Number"
                    />
                  </Field>
                  <Field
                    label="Guest Company"
                    optional
                    error={fieldErrors.guest_company}
                  >
                    <input
                      value={form.guest_company}
                      onChange={(e) =>
                        setForm({ ...form, guest_company: e.target.value })
                      }
                      className="ui-input"
                      placeholder="Organization"
                    />
                  </Field>
                </div>
              </div>
            )}

            <Field label="Visit Purpose" optional error={fieldErrors.purpose}>
              <textarea
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                className="ui-input min-h-[100px]"
                placeholder="Briefly describe the reason for your visit..."
              />
            </Field>

            <div className="flex flex-col gap-4 relative z-50">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                  Available Slots
                </h3>
                <button
                  type="button"
                  onClick={openDatePicker}
                  className="inline-flex items-center gap-2 text-xs font-bold text-cyan-400 hover:text-cyan-300 transition"
                >
                  <CalendarDays className="h-4 w-4" />
                  {new Date(date).toLocaleDateString(undefined, {
                    dateStyle: "long",
                  })}
                </button>
                <DatePicker
                  value={date}
                  minDate={new Date()}
                  onChange={(val) => {
                    if (val) setDate(val);
                  }}
                />
              </div>

              {availabilityQuery.isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <Loader2 className="h-8 w-8 animate-spin mb-4" />
                  <p className="text-sm">Checking availability...</p>
                </div>
              ) : slots.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">
                    Future slots only. Long lists stay scrollable inside this booking panel.
                  </p>
                  <div className="max-h-[25rem] overflow-y-auto ui-scrollbar pr-2">
                    <div className="space-y-3">
                      {slots.map((slot) => (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() =>
                            setForm({ ...form, time_slot_id: String(slot.id) })
                          }
                          className={clsx(
                            "group flex w-full items-center justify-between gap-4 rounded-2xl border px-4 py-4 text-left transition-all",
                            form.time_slot_id === String(slot.id)
                              ? "border-cyan-500 bg-cyan-500/10 text-cyan-100 ring-2 ring-cyan-500/50"
                              : "border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:bg-slate-900",
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div
                              className={clsx(
                                "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border",
                                form.time_slot_id === String(slot.id)
                                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                                  : "border-slate-800 bg-slate-950 text-slate-500",
                              )}
                            >
                              <Clock3 className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white">
                                {formatTimeSlotWindow(slot)}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                {slot.host?.name ?? "Assigned host"} · {formatTimeSlotDate(slot)}
                              </p>
                            </div>
                          </div>
                          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">
                            {form.time_slot_id === String(slot.id)
                              ? "Selected"
                              : "Choose"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-slate-800 bg-slate-900/30 p-12 text-center">
                  <CalendarPlus className="mx-auto h-10 w-10 text-slate-700" />
                  <h4 className="mt-4 text-sm font-semibold text-slate-300">
                    No slots available
                  </h4>
                  <p className="mt-2 text-xs text-slate-500">
                    Try selecting a different date or service offering.
                  </p>
                </div>
              )}
              {fieldErrors.time_slot_id && (
                <p className="text-xs text-rose-400">
                  {fieldErrors.time_slot_id}
                </p>
              )}
            </div>

            {error && (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-400 text-center animate-in fade-in slide-in-from-top-1">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={createVisitMutation.isPending || !form.time_slot_id}
              className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-cyan-500 py-4 font-bold text-slate-950 transition-all hover:bg-cyan-400 disabled:opacity-50 disabled:grayscale active:scale-[0.98]"
            >
              {createVisitMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  Confirm Booking
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>
        </section>

        <section className="space-y-6 relative z-10">
          <div className="ui-card ui-card-elevated">
            <div className="flex items-center gap-3">
              <Route className="h-5 w-5 text-cyan-400" />
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Routing preview
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Review how this booking moves through the system before you
                  submit.
                </p>
              </div>
            </div>
            <div className="mt-6 space-y-4">
              <SummaryCard
                label="Office"
                value={
                  selectedOffice ? formatOffice(selectedOffice) : "Not selected"
                }
                icon={Building2}
              />
              <SummaryCard
                label="Service"
                value={selectedService?.name ?? "Not selected"}
                icon={Sparkles}
              />
              <SummaryCard
                label="Department"
                value={selectedDepartment?.name ?? "Not selected"}
                icon={Route}
              />
              <SummaryCard
                label="Assigned host"
                value={
                  selectedSlot
                    ? (selectedHost?.name ??
                      selectedSlot?.host?.name ??
                      "Auto-assigned on submit")
                    : "Auto-assigned on submit"
                }
                icon={Users}
              />
              <SummaryCard
                label="Arrival window"
                value={
                  selectedSlot ? formatSlotWindow(selectedSlot) : "Not selected"
                }
                icon={Clock3}
              />
            </div>
          </div>

          <div className="ui-card ui-card-elevated">
            <div className="flex items-center gap-3">
              <CalendarPlus className="h-5 w-5 text-cyan-400" />
              <div>
                <h2 className="text-xl font-semibold text-white">
                  What happens next
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  The workflow is visible even before QR validation is fully
                  integrated.
                </p>
              </div>
            </div>
            <div className="mt-6 space-y-4">
              {[
                "Your visit starts in PENDING with the selected service, department, and assigned host visible to staff.",
                "Hosts or reception can confirm, reschedule, reassign, escalate, or move the visit through manual lifecycle steps for testing.",
                "Reception can still complete check-in from QR, PIN-supported context, or manual status controls while UniFi integration is phased in.",
              ].map((step) => (
                <div
                  key={step}
                  className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300"
                >
                  {step}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {showMap && selectedOffice?.latitude !== undefined && selectedOffice?.longitude !== undefined && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <MapPin className="h-5 w-5 text-cyan-400" />
                Location: {selectedOffice.name}
              </h3>
              <button 
                onClick={() => setShowMap(false)}
                className="p-2 -mr-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 bg-slate-950">
              <MapViewer 
                latitude={Number(selectedOffice.latitude)} 
                longitude={Number(selectedOffice.longitude)} 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  disabled,
  icon: Icon,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  icon: ComponentType<{ className?: string; "aria-hidden"?: any }>;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-wide text-slate-400"
      >
        {label}
      </label>
      <div className="relative">
        <Icon
          className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500"
          aria-hidden="true"
        />
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="ui-input py-3 pl-11 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {children}
        </select>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: any }>;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 border border-slate-800">
        <Icon className="h-5 w-5 text-cyan-400" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-semibold">
          {label}
        </p>
        <p className="mt-0.5 font-medium text-white truncate">{value}</p>
      </div>
    </div>
  );
}

function formatOffice(office: OfficeOption) {
  return [office.name, office.city, office.country].filter(Boolean).join(", ");
}

function formatSlotWindow(slot: TimeSlotOption) {
  return formatTimeSlotWindow(slot);
}
