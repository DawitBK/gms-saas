"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, format, startOfToday } from "date-fns";
import {
  CalendarRange,
  Loader2,
  Lock,
  PencilLine,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import PaginationControls from "@shared/components/PaginationControls";
import { DateRangePicker } from "@shared/components/ui/DateRangePicker";
import {
  useAvailabilityBoard,
  useCreateAvailabilityRule,
  useDeleteAvailabilityRule,
  useDeleteTimeSlot,
  useUpdateAvailabilityRule,
} from "@features/availability/hooks";
import { useCurrentHost } from "@features/hosts/useCurrentHost";
import { useHosts } from "@features/hosts/hooks";
import { useRoleContext } from "@shared/hooks/useRoleContext";
import { type DateRangeValue, getRoleLabel } from "@shared/lib/roles";
import { DatePicker } from "@shared/components/ui/DatePicker";
import { SlotActiveVisitModal } from "@shared/components/SlotActiveVisitModal";
import { useResetOnChange } from '@shared/hooks/useResetOnChange';

const WEEKDAY_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const INITIAL_FORM = {
  recurrence_type: "WEEKLY" as "DAILY" | "WEEKLY" | "MONTHLY" | "DATE_OVERRIDE",
  day_of_week: "0",
  day_of_month: "1",
  specific_date: new Date().toISOString().slice(0, 10),
  start_time: "09:00",
  end_time: "17:00",
  is_available: true,
  label: "",
  notes: "",
};

const DEFAULT_DATE_RANGE: DateRangeValue = {
  startDate: new Date().toISOString().slice(0, 10),
  endDate: addDays(new Date(), 6).toISOString().slice(0, 10),
};

export default function HostAvailabilityPage() {
  const { activeRole, isAdmin, isHost, isReception } = useRoleContext();
  const [form, setForm] = useState(INITIAL_FORM);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [selectedHostId, setSelectedHostId] = useState<number | null>(null);
  const [slotPage, setSlotPage] = useState(1);
  const [rulesPage, setRulesPage] = useState(1);
  const [otherHostsPage, setOtherHostsPage] = useState(1);
  const [dateRange, setDateRange] =
    useState<DateRangeValue>(DEFAULT_DATE_RANGE);
  const [slotFilter, setSlotFilter] = useState<string>("ALL");
  const [slotActiveVisitError, setSlotActiveVisitError] = useState<{
    code: string;
    message: string;
    visit_id: number;
    visit_status: string;
    actions_required: string[];
  } | null>(null);
  const itemsPerPage = 5;

  const currentHostQuery = useCurrentHost();
  const visibleHostsQuery = useHosts({
    activeOn: dateRange.startDate ?? undefined,
  });
  const boardQuery = useAvailabilityBoard(
    dateRange,
    selectedHostId ?? undefined,
  );
  const createRuleMutation = useCreateAvailabilityRule();
  const updateRuleMutation = useUpdateAvailabilityRule();
  const deleteRuleMutation = useDeleteAvailabilityRule();
  const deleteTimeSlotMutation = useDeleteTimeSlot();

  // Pick a default host once the queries resolve. Adjusted during render so
  // the page is never shown with no host selected for a frame after the data
  // arrives.
  useResetOnChange(
    [currentHostQuery.data?.id, isHost, selectedHostId, visibleHostsQuery.data],
    () => {
      if (selectedHostId) {
        return;
      }

      if (isHost && currentHostQuery.data?.id) {
        setSelectedHostId(currentHostQuery.data.id);
        return;
      }

      if (visibleHostsQuery.data?.data?.length) {
        setSelectedHostId(visibleHostsQuery.data.data[0].id);
      }
    },
  );

  const visibleHosts = useMemo(
    () => visibleHostsQuery.data?.data ?? [],
    [visibleHostsQuery.data],
  );
  const board = boardQuery.data;
  const canSwitchPrimaryBoard = !isHost || activeRole === "super_host";
  const canManageSelectedHost = useMemo(() => {
    if (!selectedHostId || !currentHostQuery.data?.id) {
      return false;
    }

    // Strict Permissions: Only the host themselves can manage their board.
    // Admin and Reception have NO management rights here anymore as per request.
    return currentHostQuery.data.id === selectedHostId;
  }, [currentHostQuery.data?.id, selectedHostId]);

  const groupedSlots = useMemo(() => {
    let slots = board?.slots ?? [];
    if (slotFilter !== "ALL") {
      slots = slots.filter((s) => s.slot_state === slotFilter);
    }
    return slots.reduce<Record<string, typeof slots>>((acc, slot) => {
      const key = format(new Date(slot.start_time), "EEE, MMM d");
      acc[key] = [...(acc[key] ?? []), slot];
      return acc;
    }, {});
  }, [board?.slots, slotFilter]);

  const slotDateKeys = useMemo(() => {
    return Object.keys(groupedSlots);
  }, [groupedSlots]);

  const visibleSlotKeys = slotDateKeys.slice(
    (slotPage - 1) * itemsPerPage,
    slotPage * itemsPerPage,
  );

  const paginatedRules = useMemo(() => {
    const rules = board?.rules ?? [];
    return rules.slice(
      (rulesPage - 1) * itemsPerPage,
      rulesPage * itemsPerPage,
    );
  }, [board?.rules, rulesPage]);

  const paginatedOtherHosts = useMemo(() => {
    const others = board?.other_hosts ?? [];
    return others.slice(
      (otherHostsPage - 1) * itemsPerPage,
      otherHostsPage * itemsPerPage,
    );
  }, [board?.other_hosts, otherHostsPage]);

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setEditingRuleId(null);
  };

  const handleSubmit = () => {
    if (!selectedHostId) {
      toast.error("Select a host before saving availability.");
      return;
    }

    if (!canManageSelectedHost) {
      toast.error("This host is view-only in your current role.");
      return;
    }

    const validationErrors: string[] = [];

    if (form.recurrence_type === "WEEKLY" && form.day_of_week === "") {
      validationErrors.push("Please select a weekday for weekly patterns.");
    }

    if (form.recurrence_type === "MONTHLY") {
      const dom = Number(form.day_of_month);
      if (!Number.isFinite(dom) || dom < 1 || dom > 31) {
        validationErrors.push("Please pick a valid day of month (1-31).");
      }
    }

    if (form.recurrence_type === "DATE_OVERRIDE" && !form.specific_date) {
      validationErrors.push("Please choose a specific date for this override.");
    }

    const timeToSeconds = (value: string) => {
      const [hours = 0, minutes = 0, seconds = 0] = value
        .split(":")
        .map(Number);
      return hours * 3600 + minutes * 60 + seconds;
    };

    const startSeconds = timeToSeconds(form.start_time);
    const endSeconds = timeToSeconds(form.end_time);

    if (startSeconds >= endSeconds) {
      validationErrors.push("Start time must be before end time.");
    }

    if (validationErrors.length > 0) {
      toast.error(validationErrors.join(" "));
      return;
    }

    const payload = {
      host_id: selectedHostId,
      recurrence_type: form.recurrence_type,
      ...(form.recurrence_type === "WEEKLY"
        ? { day_of_week: Number(form.day_of_week) }
        : {}),
      ...(form.recurrence_type === "MONTHLY"
        ? { day_of_month: Number(form.day_of_month) }
        : {}),
      ...(form.recurrence_type === "DATE_OVERRIDE"
        ? { specific_date: form.specific_date }
        : {}),
      start_time: form.start_time,
      end_time: form.end_time,
      is_available: form.is_available,
      horizon_days: 90,
      ...(form.label ? { label: form.label } : {}),
      ...(form.notes ? { notes: form.notes } : {}),
    };

    const onSuccess = () => {
      toast.success(
        editingRuleId
          ? "Availability rule updated."
          : "Availability rule created and slot window refreshed.",
      );
      resetForm();
      setSlotPage(1);
    };

    const onError = (error: any) => {
      toast.error(
        error?.response?.data?.error?.message ??
          "Unable to save availability rule.",
      );
    };

    if (editingRuleId) {
      updateRuleMutation.mutate(
        { id: editingRuleId, payload },
        { onSuccess, onError },
      );
      return;
    }

    createRuleMutation.mutate(payload, { onSuccess, onError });
  };

  const handleDelete = (id: number) => {
    deleteRuleMutation.mutate(id, {
      onSuccess: () => {
        toast.success("Availability rule deleted.");
        if (editingRuleId === id) {
          resetForm();
        }
      },
      onError: (error: any) => {
        toast.error(
          error?.response?.data?.error?.message ??
            "Unable to delete availability rule.",
        );
      },
    });
  };

  const handleDeleteSlot = (id: number) => {
    deleteTimeSlotMutation.mutate(id, {
      onSuccess: () => {
        toast.success("Individual time slot deleted.");
      },
      onError: (error: any) => {
        const errorCode = error?.response?.data?.error?.code;
        const errorMessage = error?.response?.data?.error?.message;

        // Check if it's the SLOT_HAS_ACTIVE_VISIT error
        if (errorCode === "SLOT_HAS_ACTIVE_VISIT" && errorMessage) {
          try {
            const errorData = JSON.parse(errorMessage);
            setSlotActiveVisitError(errorData);
          } catch {
            toast.error(errorMessage);
          }
        } else {
          toast.error(
            error?.response?.data?.error?.message ??
              "Unable to delete time slot.",
          );
        }
      },
    });
  };

  // Slots carry full ISO timestamps; rules carry plain HH:mm[:ss] times.
  const formatSlotRange = (start: string, end: string) =>
    `${format(new Date(start), "HH:mm")} - ${format(new Date(end), "HH:mm")}`;

  const formatRange = (start: string, end: string) => {
    const startLabel = start.slice(0, 5);
    const endLabel = end.slice(0, 5);
    return `${startLabel} - ${endLabel}`;
  };

  const pageHeading = isHost
    ? "Availability Settings"
    : isReception
      ? "Reception Availability Board"
      : isAdmin
        ? "Operational Availability Board"
        : "Availability Settings";

  const pageDescription = isHost
    ? "Manage your recurring rules first, then review the wider host schedule for reassignment and rescheduling decisions."
    : isReception
      ? "Review host coverage, adjust front-desk scheduling decisions, and keep reassignment options visible across your office."
      : isAdmin
        ? "Review host capacity across your managed scope and coordinate office-wide scheduling changes with full context."
        : "Review and manage schedule coverage for the selected host range.";

  return (
    <div className="space-y-8">
      <section
        className="ui-hero relative z-[60] overflow-visible"
        aria-label="Availability planning"
      >
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
              <CalendarRange className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{pageHeading}</h1>
              <p className="mt-1 text-sm font-medium text-slate-300">
                {pageDescription}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:w-[34rem] items-start">
            <div>
              <label className="ui-label">Date range</label>
              <DateRangePicker
                value={dateRange}
                onChange={setDateRange}
                minDate={startOfToday()}
              />
            </div>
            <div>
              <label className="ui-label">Primary board host</label>
              <select
                value={selectedHostId ?? ""}
                onChange={(event) =>
                  setSelectedHostId(Number(event.target.value))
                }
                className="ui-input"
                disabled={
                  visibleHostsQuery.isLoading ||
                  visibleHosts.length === 0 ||
                  !canSwitchPrimaryBoard
                }
              >
                {visibleHosts.length === 0 ? (
                  <option value="">No hosts available</option>
                ) : (
                  visibleHosts.map((host) => (
                    <option key={host.id} value={host.id}>
                      {host.user?.full_name ?? `Host #${host.id}`}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        </div>
      </section>

      {visibleHostsQuery.isLoading && !visibleHosts.length ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
        </div>
      ) : !selectedHostId ? (
        <div className="ui-card ui-card-elevated p-8 text-center">
          <p className="text-slate-400">
            No hosts are visible in your current scope.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="ui-card ui-card-elevated p-6 overflow-visible relative z-40">
            <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">
                  {editingRuleId
                    ? "Edit availability rule"
                    : "Create availability rule"}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Weekly rules now use `0-6` indexing, with Sunday mapped to
                  `0`.
                </p>
              </div>
              <div className="flex items-start gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
                <Lock className="mt-0.5 h-4 w-4 text-emerald-300" />
                <span>
                  {board?.host
                    ? `Primary board: ${board.host.name}`
                    : "Loading selected host..."}
                  {!canManageSelectedHost
                    ? ` You can review this host's availability, but only the host themselves can change rules and slots.`
                    : ""}
                </span>
              </div>
            </div>

            {canManageSelectedHost ? (
              <>
                <div className="grid gap-6 lg:grid-cols-3 items-start">
                  <div className="space-y-4">
                    <div>
                      <label className="ui-label">Pattern Type</label>
                      <select
                        value={form.recurrence_type}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            recurrence_type: event.target
                              .value as typeof current.recurrence_type,
                          }))
                        }
                        className="ui-input"
                      >
                        <option value="DAILY">Daily availability</option>
                        <option value="WEEKLY">Weekly pattern</option>
                        <option value="MONTHLY">Monthly pattern</option>
                        <option value="DATE_OVERRIDE">Date override</option>
                      </select>
                    </div>

                    {form.recurrence_type === "WEEKLY" ? (
                      <div>
                        <label className="ui-label">Day of week</label>
                        <select
                          value={form.day_of_week}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              day_of_week: event.target.value,
                            }))
                          }
                          className="ui-input"
                        >
                          {WEEKDAY_OPTIONS.map((day) => (
                            <option key={day.value} value={day.value}>
                              {day.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    {form.recurrence_type === "MONTHLY" ? (
                      <div>
                        <label className="ui-label">Day of month</label>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={form.day_of_month}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              day_of_month: event.target.value,
                            }))
                          }
                          className="ui-input"
                        />
                      </div>
                    ) : null}

                    <div className="relative z-50">
                      <label className="ui-label">Specific date</label>
                      <DatePicker
                        value={form.specific_date}
                        minDate={startOfToday()}
                        onChange={(val) => {
                          if (val) {
                            setForm((current) => ({
                              ...current,
                              specific_date: val,
                            }));
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2 items-start">
                      <div>
                        <label className="ui-label">Start time</label>
                        <input
                          type="time"
                          value={form.start_time}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              start_time: event.target.value,
                            }))
                          }
                          className="ui-input"
                        />
                      </div>
                      <div>
                        <label className="ui-label">End time</label>
                        <input
                          type="time"
                          value={form.end_time}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              end_time: event.target.value,
                            }))
                          }
                          className="ui-input"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="ui-label">Availability status</label>
                      <select
                        value={form.is_available ? "true" : "false"}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            is_available: event.target.value === "true",
                          }))
                        }
                        className="ui-input"
                      >
                        <option value="true">Available</option>
                        <option value="false">Unavailable</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="ui-label">Label</label>
                      <input
                        type="text"
                        value={form.label}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            label: event.target.value,
                          }))
                        }
                        className="ui-input"
                        placeholder="Regular office hours"
                      />
                    </div>
                    <div>
                      <label className="ui-label">Notes</label>
                      <textarea
                        value={form.notes}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            notes: event.target.value,
                          }))
                        }
                        className="ui-input min-h-[108px]"
                        placeholder="Add any scheduling context for this rule."
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={
                      createRuleMutation.isPending ||
                      updateRuleMutation.isPending ||
                      !canManageSelectedHost
                    }
                    className="ui-btn ui-btn-primary"
                  >
                    {createRuleMutation.isPending ||
                    updateRuleMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : editingRuleId ? (
                      <PencilLine className="h-4 w-4" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    {editingRuleId ? "Update rule" : "Create rule"}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="ui-btn ui-btn-secondary"
                  >
                    Reset form
                  </button>
                </div>
              </>
            ) : (
              <div className="py-8 text-center border border-dashed border-slate-800 rounded-3xl">
                <p className="text-slate-500 text-sm italic">
                  Rule management is restricted to the host owner.
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.35fr,0.95fr] items-start">
            <div className="ui-card ui-card-elevated p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white">
                    Generated schedule
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    {board?.range.start && board?.range.end
                      ? `Showing slots from ${format(new Date(board.range.start), "MMM d")} to ${format(new Date(board.range.end), "MMM d, yyyy")}.`
                      : "Loading slot window..."}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      Status Filter:
                    </span>
                    <select
                      value={slotFilter}
                      onChange={(e) => {
                        setSlotFilter(e.target.value);
                        setSlotPage(1);
                      }}
                      className="bg-transparent border-none text-xs font-bold text-emerald-400 focus:ring-0 outline-none cursor-pointer"
                    >
                      <option value="ALL">All States</option>
                      <option value="AVAILABLE">Available</option>
                      <option value="BOOKED">Booked</option>
                      <option value="BLOCKED">Blocked</option>
                    </select>
                  </div>
                </div>
              </div>

              {boardQuery.isPending ? (
                <div className="mt-6 flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading generated slots...
                </div>
              ) : boardQuery.isError ? (
                <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
                  Unable to load availability right now.
                </div>
              ) : visibleSlotKeys.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-400">
                  No slots exist in the selected range yet.
                </div>
              ) : (
                <div className="mt-6 max-h-[500px] overflow-y-auto pr-2 ui-scrollbar space-y-4">
                  {visibleSlotKeys.map((dateLabel) => (
                    <div
                      key={dateLabel}
                      className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"
                    >
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                        {dateLabel}
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {(groupedSlots[dateLabel] ?? []).map((slot) => (
                          <div
                            key={slot.id}
                            className={`rounded-2xl border px-4 py-3 text-sm ${
                              slot.slot_state === "BOOKED"
                                ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                                : slot.slot_state === "BLOCKED"
                                  ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
                                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span>
                                {formatSlotRange(slot.start_time, slot.end_time)}
                              </span>
                              <div className="flex items-center gap-3">
                                <span className="text-[11px] uppercase tracking-[0.2em]">
                                  {slot.slot_state}
                                </span>
                                {canManageSelectedHost &&
                                  slot.slot_state !== "BOOKED" && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteSlot(slot.id);
                                      }}
                                      disabled={
                                        deleteTimeSlotMutation.isPending
                                      }
                                      className="text-rose-500/50 hover:text-rose-400 transition-colors"
                                      title="Delete individual slot"
                                    >
                                      {deleteTimeSlotMutation.isPending ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                  )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 flex items-center justify-between">
                <PaginationControls
                  page={slotPage}
                  onPageChange={setSlotPage}
                  hasPrevious={slotPage > 1}
                  hasNext={
                    slotPage < Math.ceil(slotDateKeys.length / itemsPerPage)
                  }
                  totalPages={Math.max(
                    1,
                    Math.ceil(slotDateKeys.length / itemsPerPage),
                  )}
                />
                <button
                  type="button"
                  onClick={() => setSlotPage(1)}
                  className="ui-btn ui-btn-secondary px-6"
                >
                  First page
                </button>
              </div>
            </div>

            <div className="space-y-6">
              <div className="ui-card ui-card-elevated p-6">
                <h2 className="text-xl font-bold text-white">
                  Availability rules
                </h2>
                <div className="mt-4 max-h-[400px] overflow-y-auto pr-2 ui-scrollbar space-y-4">
                  {paginatedRules.length ? (
                    paginatedRules.map((rule) => (
                      <div
                        key={rule.id}
                        className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-white">
                              {rule.recurrence_type === "DAILY" && "Daily"}
                              {rule.recurrence_type === "WEEKLY" &&
                                `Weekly (${WEEKDAY_OPTIONS[Number(rule.day_of_week)]?.label ?? "Unknown"})`}
                              {rule.recurrence_type === "MONTHLY" &&
                                `Monthly (${rule.day_of_month})`}
                              {rule.recurrence_type === "DATE_OVERRIDE" &&
                                `Date override (${rule.specific_date ? format(new Date(rule.specific_date), "MMM d, yyyy") : "No date"})`}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              {formatRange(rule.start_time, rule.end_time)} •{" "}
                              {rule.is_available ? "Available" : "Unavailable"}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRuleId(rule.id);
                                setForm({
                                  recurrence_type: rule.recurrence_type,
                                  day_of_week:
                                    rule.day_of_week?.toString() ?? "0",
                                  day_of_month:
                                    rule.day_of_month?.toString() ?? "1",
                                  specific_date: rule.specific_date ?? "",
                                  start_time: rule.start_time.slice(0, 5),
                                  end_time: rule.end_time.slice(0, 5),
                                  is_available: rule.is_available,
                                  label: rule.label ?? "",
                                  notes: rule.notes ?? "",
                                });
                              }}
                              className="ui-btn ui-btn-secondary px-3 py-2 text-xs"
                            >
                              Load
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(rule.id)}
                              disabled={
                                deleteRuleMutation.isPending ||
                                !canManageSelectedHost
                              }
                              className="ui-btn ui-btn-danger px-3 py-2 text-xs"
                            >
                              {deleteRuleMutation.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-400">
                      No rules have been created for this host yet.
                    </div>
                  )}
                </div>
                {board?.rules?.length && board.rules.length > itemsPerPage ? (
                  <div className="mt-6 border-t border-slate-800 pt-6">
                    <PaginationControls
                      page={rulesPage}
                      onPageChange={setRulesPage}
                      hasPrevious={rulesPage > 1}
                      hasNext={rulesPage * itemsPerPage < board.rules.length}
                      totalPages={Math.ceil(board.rules.length / itemsPerPage)}
                    />
                  </div>
                ) : null}
              </div>

              <div className="ui-card ui-card-elevated p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-white">
                      Other Hosts Availability
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                      {activeRole === "super_admin" ||
                      activeRole === "super_reception" ||
                      activeRole === "super_host"
                        ? "Showing cross-office host availability in the selected range."
                        : "Showing hosts inside your office for reassignment and rescheduling context."}
                    </p>
                  </div>
                </div>

                <div className="mt-4 max-h-[500px] overflow-y-auto pr-2 ui-scrollbar space-y-4">
                  {paginatedOtherHosts.length ? (
                    paginatedOtherHosts.map((host) => (
                      <div
                        key={host.id}
                        className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">
                              {host.name}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              {host.email ?? "No email"} •{" "}
                              {host.available_slots_count} available slot
                              {host.available_slots_count === 1 ? "" : "s"}
                            </p>
                          </div>
                          {canSwitchPrimaryBoard ? (
                            <button
                              type="button"
                              onClick={() => setSelectedHostId(host.id)}
                              className="ui-btn ui-btn-secondary px-3 py-2 text-xs"
                            >
                              View board
                            </button>
                          ) : null}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {host.slots.length ? (
                            host.slots.slice(0, 6).map((slot) => (
                              <span
                                key={slot.id}
                                className={`rounded-full px-3 py-1 text-xs ${
                                  slot.slot_state === "AVAILABLE"
                                    ? "bg-emerald-500/10 text-emerald-200"
                                    : slot.slot_state === "BOOKED"
                                      ? "bg-amber-500/10 text-amber-200"
                                      : "bg-rose-500/10 text-rose-200"
                                }`}
                              >
                                {format(
                                  new Date(slot.start_time),
                                  "MMM d, h:mm a",
                                )}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-500">
                              No slots in the selected range.
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-400">
                      No additional host schedules are visible in this range.
                    </div>
                  )}
                </div>
                {board?.other_hosts?.length &&
                board.other_hosts.length > itemsPerPage ? (
                  <div className="mt-6 border-t border-slate-800 pt-6">
                    <PaginationControls
                      page={otherHostsPage}
                      onPageChange={setOtherHostsPage}
                      hasPrevious={otherHostsPage > 1}
                      hasNext={
                        otherHostsPage * itemsPerPage < board.other_hosts.length
                      }
                      totalPages={Math.ceil(
                        board.other_hosts.length / itemsPerPage,
                      )}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      <SlotActiveVisitModal
        isOpen={!!slotActiveVisitError}
        onClose={() => setSlotActiveVisitError(null)}
        errorData={slotActiveVisitError}
      />
    </div>
  );
}
