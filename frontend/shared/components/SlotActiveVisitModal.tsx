"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Calendar,
  ArrowUpRight,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  useReassignVisit,
  useRescheduleVisit,
  useEscalateVisit,
} from "@features/visits/hooks";

interface SlotActiveVisitModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorData: {
    code: string;
    message: string;
    visit_id: number;
    visit_status: string;
    actions_required: string[];
  } | null;
}

export function SlotActiveVisitModal({
  isOpen,
  onClose,
  errorData,
}: SlotActiveVisitModalProps) {
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [selectedHostId, setSelectedHostId] = useState<number | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>("");
  const [escalationReason, setEscalationReason] = useState<string>("");

  const reassignMutation = useReassignVisit();
  const rescheduleMutation = useRescheduleVisit();
  const escalateMutation = useEscalateVisit();

  if (!isOpen || !errorData) return null;

  const handleReassign = async () => {
    if (!selectedHostId) {
      toast.error("Please select a host");
      return;
    }
    try {
      await reassignMutation.mutateAsync({
        id: errorData.visit_id,
        host_id: selectedHostId,
        note: "Host reassignment due to slot deletion",
      });
      toast.success("Visit reassigned successfully");
      onClose();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error?.message ?? "Failed to reassign visit",
      );
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleDate) {
      toast.error("Please select a new date/time");
      return;
    }
    try {
      // Need to get the time_slot_id from the API - for now we'll show an error
      toast.error(
        "Please use the visit management page to reschedule with a specific time slot",
      );
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error?.message ?? "Failed to reschedule visit",
      );
    }
  };

  const handleEscalate = async () => {
    if (!escalationReason.trim()) {
      toast.error("Please provide an escalation reason");
      return;
    }
    try {
      await escalateMutation.mutateAsync({
        id: errorData.visit_id,
        reason: escalationReason,
      });
      toast.success("Visit escalated to reception");
      onClose();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error?.message ?? "Failed to escalate visit",
      );
    }
  };

  const availableActions = errorData.actions_required || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-amber-500/30 bg-slate-950 p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">
              Cannot Delete Time Slot
            </h2>
            <p className="mt-1 text-sm text-slate-400">{errorData.message}</p>
            <div className="mt-2 text-xs text-slate-500">
              Visit ID:{" "}
              <span className="font-mono text-slate-300">
                #{errorData.visit_id}
              </span>{" "}
              · Status:{" "}
              <span className="text-amber-400">{errorData.visit_status}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Resolve by:
          </p>

          {availableActions.includes("REASSIGN") && (
            <button
              onClick={() => setSelectedAction("REASSIGN")}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                selectedAction === "REASSIGN"
                  ? "border-emerald-500/50 bg-emerald-500/10"
                  : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
              }`}
            >
              <Users className="h-5 w-5 text-emerald-400" />
              <div>
                <p className="font-medium text-white">Reassign Host</p>
                <p className="text-xs text-slate-400">
                  Assign to a different host
                </p>
              </div>
            </button>
          )}

          {availableActions.includes("RESCHEDULE") && (
            <button
              onClick={() => setSelectedAction("RESCHEDULE")}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                selectedAction === "RESCHEDULE"
                  ? "border-blue-500/50 bg-blue-500/10"
                  : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
              }`}
            >
              <Calendar className="h-5 w-5 text-blue-400" />
              <div>
                <p className="font-medium text-white">Reschedule Visit</p>
                <p className="text-xs text-slate-400">
                  Move to a different time slot
                </p>
              </div>
            </button>
          )}

          {availableActions.includes("ESCALATE") && (
            <button
              onClick={() => setSelectedAction("ESCALATE")}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                selectedAction === "ESCALATE"
                  ? "border-amber-500/50 bg-amber-500/10"
                  : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
              }`}
            >
              <ArrowUpRight className="h-5 w-5 text-amber-400" />
              <div>
                <p className="font-medium text-white">Escalate to Reception</p>
                <p className="text-xs text-slate-400">
                  Let reception handle this
                </p>
              </div>
            </button>
          )}
        </div>

        {selectedAction === "REASSIGN" && (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <label className="text-sm font-medium text-slate-300">
              Select New Host
            </label>
            <select
              value={selectedHostId ?? ""}
              onChange={(e) => setSelectedHostId(Number(e.target.value))}
              className="ui-input mt-2"
            >
              <option value="">Select host...</option>
              {/* Host options would be populated from API */}
            </select>
            <button
              onClick={handleReassign}
              disabled={reassignMutation.isPending}
              className="ui-btn ui-btn-primary mt-3 w-full"
            >
              {reassignMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Confirm Reassignment
            </button>
          </div>
        )}

        {selectedAction === "RESCHEDULE" && (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <label className="text-sm font-medium text-slate-300">
              New Date/Time
            </label>
            <input
              type="datetime-local"
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
              className="ui-input mt-2"
            />
            <button
              onClick={handleReschedule}
              disabled={rescheduleMutation.isPending}
              className="ui-btn ui-btn-primary mt-3 w-full"
            >
              {rescheduleMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Confirm Reschedule
            </button>
          </div>
        )}

        {selectedAction === "ESCALATE" && (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <label className="text-sm font-medium text-slate-300">
              Escalation Reason
            </label>
            <textarea
              value={escalationReason}
              onChange={(e) => setEscalationReason(e.target.value)}
              placeholder="Explain why this visit needs escalation..."
              className="ui-input mt-2 min-h-[80px]"
            />
            <button
              onClick={handleEscalate}
              disabled={escalateMutation.isPending}
              className="ui-btn ui-btn-primary mt-3 w-full"
            >
              {escalateMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Escalate to Reception
            </button>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="ui-btn ui-btn-secondary flex-1">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
