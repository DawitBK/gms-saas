"use client";

import { useLicenseStatus } from "@features/license/hooks";
import type { LicenseStatus } from "@features/license/types";

type Notice = { key: string; tone: "amber" | "red"; text: string };

const formatDate = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Pure, so the wording is in one place: licence status in, the notice to show (or null) out. "No licence configured" shows nothing (owner decision 2026-10-19). */
export function licenseNotice(status: LicenseStatus | undefined): Notice | null {
  if (!status) return null;

  switch (status.state) {
    case "expiring": {
      const days = Math.max(status.daysRemaining ?? 0, 0);
      const when = formatDate(status.expiresAt);
      return {
        key: "expiring",
        tone: "amber",
        text: `The GMS licence expires ${days === 0 ? "today" : `in ${plural(days, "day")}`}${when ? ` (${when})` : ""}. Contact your administrator to renew it.`,
      };
    }
    case "grace": {
      const ends = formatDate(status.graceEndsAt);
      return {
        key: "grace",
        tone: "amber",
        text: `The GMS licence has expired. Everything still works${ends ? ` until ${ends}` : " for now"}; after that the system becomes read-only. Contact your administrator to renew it.`,
      };
    }
    case "expired":
      return {
        key: "expired",
        tone: "red",
        text: status.readOnly
          ? "The GMS licence has expired and the system is read-only: you can view records but not change them. Contact your administrator."
          : "The GMS licence has expired. Contact your administrator.",
      };
    default:
      return null;
  }
}

const toneClass: Record<Notice["tone"], string> = {
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  red: "border-red-200 bg-red-50 text-red-900",
};

export function LicenseBanner() {
  const { data } = useLicenseStatus();
  const notice = licenseNotice(data);

  if (!notice) return null;

  return (
    <div
      role={notice.tone === "red" ? "alert" : "status"}
      className={`mb-4 rounded-lg border px-4 py-2 text-sm ${toneClass[notice.tone]}`}
    >
      {notice.text}
    </div>
  );
}
