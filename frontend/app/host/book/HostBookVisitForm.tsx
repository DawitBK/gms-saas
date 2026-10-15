"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Users,
  UserPlus,
  Search,
  CheckCircle2,
  Loader2,
  CalendarDays,
  Clock3,
  ArrowRight,
  ShieldCheck,
  CreditCard,
  Camera,
  Check,
  Upload,
  User,
  Mail,
  Phone,
  Building,
} from "lucide-react";
import { useGuestsList } from "@features/guests/hooks";
import {
  useOffices,
  useDepartments,
  useServices,
  useTimeSlots,
} from "@features/catalog/hooks";
import { useHosts } from "@features/hosts/hooks";
import { useCurrentHost } from "@features/hosts/useCurrentHost";
import { useCreateVisit } from "@features/visits/hooks";
import { toast } from "sonner";
import clsx from "clsx";
import { format } from "date-fns";

import { Field } from "@shared/components/ui/Field";
import { CameraScanner } from "@shared/components/ui/CameraScanner";
import { useScanDocument } from "@features/ocr/hooks";
import { DatePicker } from "@shared/components/ui/DatePicker";

export function HostBookVisitForm() {
  const [step, setStep] = useState(1);
  const [guestMode, setGuestPayloadMode] = useState<"select" | "create">(
    "select",
  );
  const [selectedGuestId, setSelectedGuestId] = useState<number | null>(null);
  const [guestPayload, setGuestPayload] = useState({
    full_name: "",
    email: "",
    phone: "",
    company: "",
    government_id: "",
    document_url: "",
  });
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [guestSearch, setGuestSearch] = useState("");
  const scanMutation = useScanDocument();

  const [form, setForm] = useState({
    office_id: "",
    department_id: "",
    service_id: "",
    delegated_host_id: "",
    host_id: "",
    time_slot_id: "",
    purpose: "",
  });

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: guestsData, isLoading: isLoadingGuests } = useGuestsList({
    limit: 50,
    q: guestSearch || undefined,
  });
  const officesQuery = useOffices();
  const officeId = form.office_id ? Number(form.office_id) : undefined;
  const departmentsQuery = useDepartments(officeId);
  const servicesQuery = useServices(officeId);

  const serviceId = form.service_id ? Number(form.service_id) : undefined;
  const routedDepartmentId = serviceId
    ? servicesQuery.data?.find((s) => s.id === serviceId)?.department_id
    : form.department_id
      ? Number(form.department_id)
      : undefined;

  const hostsQuery = useHosts({ officeId });
  const hostOptions = Array.isArray(hostsQuery.data)
    ? hostsQuery.data
    : (hostsQuery.data?.data ?? []);

  const availabilityQuery = useTimeSlots({
    officeId,
    serviceId,
    departmentId: routedDepartmentId,
    date,
    hostId: form.delegated_host_id ? Number(form.delegated_host_id) : undefined,
  });

  const currentHostQuery = useCurrentHost();
  const createVisit = useCreateVisit();

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleCreateVisit = async () => {
    setErrors({});

    try {
      // When "Book for myself" (no delegated host), use the current host's ID.
      // When delegating, use the host_id set from the selected slot.
      const resolvedHostId = form.delegated_host_id
        ? (form.host_id ? Number(form.host_id) : undefined)
        : (currentHostQuery.data?.id ? Number(currentHostQuery.data.id) : undefined);

      const payload = {
        office_id: Number(form.office_id),
        department_id: routedDepartmentId || null,
        service_id: serviceId || null,
        time_slot_id: Number(form.time_slot_id),
        host_id: resolvedHostId,
        purpose: form.purpose,
        guest_id:
          guestMode === "select" && selectedGuestId !== null
            ? Number(selectedGuestId)
            : undefined,
        guest_payload: guestMode === "create" ? guestPayload : undefined,
      };

      await createVisit.mutateAsync(payload);

      toast.success("Visit booked successfully!");
      setStep(4); // Success step
    } catch (err: any) {
      const backendError = err.response?.data?.error;

      if (backendError?.code === "INVALID_INPUT" && backendError.details) {
        const fieldErrors: Record<string, string> = {};
        backendError.details.forEach((d: any) => {
          fieldErrors[d.field] = d.message;
        });
        setErrors(fieldErrors);
        toast.error("Please fix the errors in the form.");
      } else {
        const msg =
          err.response?.data?.message || err.message || "Failed to book visit";
        toast.error(msg);
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Stepper */}
      <div className="flex items-center justify-between mb-12 relative px-4">
        <div className="absolute top-1/2 left-0 right-0 h-px bg-slate-800 -z-10" />
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className="flex flex-col items-center gap-3 bg-slate-950 px-4"
          >
            <div
              className={clsx(
                "h-12 w-12 rounded-2xl flex items-center justify-center text-sm font-bold transition-all duration-500",
                step === s
                  ? "bg-cyan-500 text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.4)] scale-110"
                  : step > s
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-slate-900 text-slate-500 border border-slate-800",
              )}
            >
              {step > s ? <CheckCircle2 className="h-6 w-6" /> : s}
            </div>
            <span
              className={clsx(
                "text-[10px] font-bold uppercase tracking-[0.2em]",
                step === s ? "text-cyan-400" : "text-slate-500",
              )}
            >
              {s === 1 ? "Guest" : s === 2 ? "Flow" : "Schedule"}
            </span>
          </div>
        ))}
      </div>

      <div className="ui-card ui-card-elevated p-8">
        {step === 1 && (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Identify Guest</h2>
                <p className="text-sm text-slate-400 mt-1">
                  Select an existing contact or register a new visitor.
                </p>
              </div>
              <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setGuestPayloadMode("select")}
                  className={clsx(
                    "px-4 py-1.5 text-xs font-bold rounded-lg transition",
                    guestMode === "select"
                      ? "bg-slate-800 text-white shadow-sm"
                      : "text-slate-500",
                  )}
                >
                  Existing
                </button>
                <button
                  onClick={() => setGuestPayloadMode("create")}
                  className={clsx(
                    "px-4 py-1.5 text-xs font-bold rounded-lg transition",
                    guestMode === "create"
                      ? "bg-slate-800 text-white shadow-sm"
                      : "text-slate-500",
                  )}
                >
                  New Guest
                </button>
              </div>
            </div>

            {guestMode === "select" ? (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    className="ui-input pl-11"
                    placeholder="Search contacts by name or email..."
                    value={guestSearch}
                    onChange={(e) => setGuestSearch(e.target.value)}
                  />
                </div>
                <div className="grid gap-3 max-h-[340px] overflow-y-auto pr-2 ui-scrollbar">
                  {isLoadingGuests ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">
                        Searching Contacts
                      </p>
                    </div>
                  ) : guestsData?.data.length ? (
                    guestsData.data.map((guest) => (
                      <button
                        key={guest.id}
                        onClick={() => setSelectedGuestId(guest.user_id)}
                        className={clsx(
                          "flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 text-left group",
                          selectedGuestId === guest.user_id
                            ? "bg-cyan-500/10 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                            : "bg-slate-900/40 border-slate-800/50 hover:border-slate-700 hover:bg-slate-900/60",
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={clsx(
                              "h-12 w-12 rounded-xl flex items-center justify-center transition-colors",
                              selectedGuestId === guest.user_id
                                ? "bg-cyan-500 text-slate-950"
                                : "bg-slate-800 text-slate-500 group-hover:bg-slate-700",
                            )}
                          >
                            <User className="h-6 w-6" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-white group-hover:text-cyan-400 transition-colors">
                                {guest.full_name}
                              </p>
                              {guest.is_vip ? (
                                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-400">
                                  VIP
                                </span>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="flex items-center gap-1 text-[10px] text-slate-500">
                                <Mail className="h-3 w-3" />
                                {guest.email}
                              </span>
                              {guest.phone && (
                                <span className="flex items-center gap-1 text-[10px] text-slate-500">
                                  <Phone className="h-3 w-3" />
                                  {guest.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div
                          className={clsx(
                            "h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all",
                            selectedGuestId === guest.user_id
                              ? "bg-cyan-500 border-cyan-500 text-slate-950"
                              : "border-slate-800 text-transparent",
                          )}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="text-center py-12 rounded-3xl border border-dashed border-slate-800 bg-slate-900/20">
                      <Search className="mx-auto h-8 w-8 text-slate-700 mb-3" />
                      <p className="text-sm text-slate-500">
                        No contacts found matching &quot;{guestSearch}&quot;
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <Field label="Full Name" error={errors.full_name}>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                      <input
                        className="ui-input pl-11"
                        value={guestPayload.full_name}
                        placeholder="John Doe"
                        onChange={(e) =>
                          setGuestPayload((p) => ({
                            ...p,
                            full_name: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </Field>
                  <Field label="Email Address" error={errors.email}>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                      <input
                        className="ui-input pl-11"
                        type="email"
                        placeholder="john@example.com"
                        value={guestPayload.email}
                        onChange={(e) =>
                          setGuestPayload((p) => ({
                            ...p,
                            email: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </Field>
                  <Field label="Phone" error={errors.phone} optional>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                      <input
                        className="ui-input pl-11"
                        placeholder="+1 ..."
                        value={guestPayload.phone}
                        onChange={(e) =>
                          setGuestPayload((p) => ({
                            ...p,
                            phone: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </Field>
                  <Field label="Company" error={errors.company} optional>
                    <div className="relative">
                      <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                      <input
                        className="ui-input pl-11"
                        placeholder="Organization Name"
                        value={guestPayload.company}
                        onChange={(e) =>
                          setGuestPayload((p) => ({
                            ...p,
                            company: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </Field>
                </div>

                <div className="grid gap-6 md:grid-cols-2 border-t border-slate-800 pt-6">
                  <Field
                    label="Gov ID / Passport"
                    error={errors.government_id}
                    optional
                  >
                    <div className="relative">
                      <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                      <input
                        className="ui-input pl-11"
                        placeholder="ID Number"
                        value={guestPayload.government_id}
                        onChange={(e) =>
                          setGuestPayload((p) => ({
                            ...p,
                            government_id: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </Field>
                  <Field label="ID Document Capture" optional>
                    <div className="flex flex-col gap-3">
                      <button
                        type="button"
                        onClick={() => setIsScannerOpen(true)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-500/30 bg-cyan-500/5 py-3.5 text-sm font-bold text-cyan-400 transition hover:bg-cyan-500/10 active:scale-[0.98]"
                      >
                        <Camera className="h-5 w-5" />
                        Scan with Camera
                      </button>
                      {guestPayload.document_url && (
                        <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 px-4 py-3 border border-emerald-500/20">
                          <p className="text-xs font-bold text-emerald-400 flex items-center gap-2">
                            <Check className="h-4 w-4" />
                            Document Captured
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              setGuestPayload((p) => ({
                                ...p,
                                document_url: "",
                              }))
                            }
                            className="text-[10px] font-bold uppercase tracking-widest text-rose-400 hover:text-rose-300 transition-colors"
                          >
                            Clear
                          </button>
                        </div>
                      )}
                    </div>
                  </Field>
                </div>
              </div>
            )}

            <button
              disabled={
                guestMode === "select"
                  ? !selectedGuestId
                  : !guestPayload.full_name || !guestPayload.email
              }
              onClick={() => setStep(2)}
              className="ui-btn ui-btn-primary w-full py-4 rounded-2xl font-bold mt-4"
            >
              Continue to Service Selection
              <ArrowRight className="ml-2 h-5 w-5" />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white">Select Service</h2>
            <div className="grid gap-4">
              <Field label="Office" error={errors.office_id}>
                <select
                  className="ui-input"
                  value={form.office_id}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      office_id: e.target.value,
                      department_id: "",
                      service_id: "",
                    }))
                  }
                >
                  <option value="">Select an office</option>
                  {officesQuery.data?.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Service" error={errors.service_id}>
                <select
                  className="ui-input"
                  value={form.service_id}
                  disabled={!form.office_id}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, service_id: e.target.value }))
                  }
                >
                  <option value="">Select a service</option>
                  {servicesQuery.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.duration_minutes}m)
                    </option>
                  ))}
                </select>
              </Field>

              {form.office_id && (
                <Field
                  label="Delegated Host"
                  error={errors.delegated_host_id}
                  optional
                >
                  <select
                    className="ui-input"
                    value={form.delegated_host_id}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        delegated_host_id: e.target.value,
                      }))
                    }
                  >
                    <option value="">Book for myself -- Default</option>
                    {hostOptions.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.user?.full_name ?? `Host #${h.id}`}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Select another host to book the visit on their behalf.
                  </p>
                </Field>
              )}

              <Field label="Visit Purpose" error={errors.purpose}>
                <textarea
                  className="ui-input min-h-[100px] py-3"
                  placeholder="What is the reason for this visit?"
                  value={form.purpose}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, purpose: e.target.value }))
                  }
                />
              </Field>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setStep(1)}
                className="ui-btn ui-btn-secondary flex-1 py-4 rounded-2xl font-bold"
              >
                Back
              </button>
              <button
                disabled={!form.office_id || !form.service_id}
                onClick={() => setStep(3)}
                className="ui-btn ui-btn-primary flex-[2] py-4 rounded-2xl font-bold"
              >
                Choose Time Slot
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-white">Schedule Visit</h2>
              <div className="w-[180px]">
                <DatePicker
                  value={date}
                  minDate={new Date()}
                  onChange={(val) => {
                    if (val) setDate(val);
                  }}
                />
              </div>
            </div>

            {availabilityQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {availabilityQuery.data?.slots.map((slot) => (
                    <button
                      key={slot.id}
                      onClick={() =>
                        setForm((p) => ({
                          ...p,
                          time_slot_id: slot.id.toString(),
                          host_id: slot.host_id.toString(),
                        }))
                      }
                      className={clsx(
                        "p-3 rounded-xl border text-center transition-all",
                        form.time_slot_id === slot.id.toString()
                          ? "bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/20"
                          : "bg-slate-900/50 border-slate-800 text-slate-300 hover:border-slate-700",
                      )}
                    >
                      <p className="text-sm font-bold">
                        {format(new Date(slot.start_time), "HH:mm")}
                      </p>
                      <p className="text-[10px] opacity-60 mt-0.5">Available</p>
                    </button>
                  ))}
                </div>

                {!availabilityQuery.data?.slots.length && (
                  <div className="text-center py-12 bg-slate-900/30 rounded-3xl border border-dashed border-slate-800">
                    <CalendarDays className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-400">
                      No available slots for this date.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setStep(2)}
                className="ui-btn ui-btn-secondary flex-1 py-4 rounded-2xl font-bold"
              >
                Back
              </button>
              <button
                disabled={!form.time_slot_id || createVisit.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCreateVisit();
                }}
                className="ui-btn ui-btn-primary flex-[2] py-4 rounded-2xl font-bold"
              >
                {createVisit.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  "Confirm Booking"
                )}
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="text-center py-8">
            <div className="h-20 w-20 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h2 className="text-2xl font-bold text-white">
              Booking Confirmed!
            </h2>
            <p className="text-slate-400 mt-2 max-w-sm mx-auto">
              The visit has been scheduled and the guest will receive a
              confirmation email with their access details.
            </p>
            <div className="mt-8 flex flex-col gap-3">
              <button
                onClick={() => {
                  setStep(1);
                  setForm({
                    office_id: "",
                    department_id: "",
                    service_id: "",
                    delegated_host_id: "",
                    host_id: "",
                    time_slot_id: "",
                    purpose: "",
                  });
                  setSelectedGuestId(null);
                }}
                className="ui-btn ui-btn-primary py-4 rounded-2xl font-bold"
              >
                Book Another Visit
              </button>
              <Link
                href="/host/visits"
                className="ui-btn ui-btn-secondary py-4 rounded-2xl font-bold"
              >
                Go to Visit Board
              </Link>
            </div>
          </div>
        )}
      </div>

      {isScannerOpen && (
        <CameraScanner
          onClose={() => setIsScannerOpen(false)}
          onCapture={async (base64) => {
            setIsScannerOpen(false);
            setGuestPayload((prev) => ({ ...prev, document_url: base64 }));
            try {
              const result = await scanMutation.mutateAsync({ image: base64 });
              if (result.success && result.data.extracted) {
                const { full_name, id_number } = result.data.extracted;
                setGuestPayload((prev) => ({
                  ...prev,
                  full_name: full_name || prev.full_name,
                  government_id: id_number || prev.government_id,
                }));
                toast.success("ID details extracted automatically.");
              }
            } catch (err) {
              console.error("OCR extraction failed:", err);
            }
          }}
          title="Scan Guest ID"
        />
      )}
    </div>
  );
}

const INITIAL_FORM = {
  office_id: "",
  department_id: "",
  service_id: "",
  delegated_host_id: "",
  host_id: "",
  time_slot_id: "",
  purpose: "",
};
