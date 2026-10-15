import type { Visit } from "@features/visits/types";
import {
  getStatusMeta,
  readableVisitStatus,
} from "@shared/lib/visit-statuses";

export function readableStatus(value: Visit["status"]) {
  return readableVisitStatus(value);
}

export function StatusBadge({ value }: { value: Visit["status"] }) {
  const meta = getStatusMeta(value);
  const Icon = meta.icon;

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em] ${meta.badgeClasses}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {readableStatus(value)}
    </span>
  );
}
