"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfToday,
  startOfWeek,
  subMonths,
} from "date-fns";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";
import type { DateRangeValue } from "@shared/lib/roles";
import { useResetOnChange } from '@shared/hooks/useResetOnChange';

type DateRangePickerProps = {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  minDate?: Date | null;
};

function toDate(value: string | null) {
  return value ? parseISO(value) : null;
}

function formatValue(value: DateRangeValue) {
  if (!value.startDate && !value.endDate) {
    return "Choose range";
  }

  if (value.startDate && !value.endDate) {
    return format(parseISO(value.startDate), "MMM d, yyyy");
  }

  if (value.startDate && value.endDate) {
    return `${format(parseISO(value.startDate), "MMM d")} - ${format(parseISO(value.endDate), "MMM d, yyyy")}`;
  }

  return "Choose range";
}

export function DateRangePicker({ value, onChange, minDate }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => toDate(value.startDate) ?? startOfToday());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startDate = toDate(value.startDate);
  const endDate = toDate(value.endDate);

  // Show the month containing the range start whenever the popover opens.
  // During render, so the calendar never flashes the previous month first.
  useResetOnChange([open, value.startDate], () => {
    if (!open) return;
    setVisibleMonth(toDate(value.startDate) ?? startOfToday());
  });

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const days = useMemo(() => {
    const monthStart = startOfMonth(visibleMonth);
    const monthEnd = endOfMonth(visibleMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const results: Date[] = [];

    for (let cursor = gridStart; !isAfter(cursor, gridEnd); cursor = addDays(cursor, 1)) {
      results.push(cursor);
    }
    return results;
  }, [visibleMonth]);

  const applyRange = (date: Date) => {
    const iso = format(date, "yyyy-MM-dd");
    if (!value.startDate || (value.startDate && value.endDate)) {
      onChange({ startDate: iso, endDate: null });
      return;
    }

    if (isBefore(date, parseISO(value.startDate))) {
      onChange({ startDate: iso, endDate: value.startDate });
      return;
    }

    onChange({ startDate: value.startDate, endDate: iso });
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative z-20">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="ui-input flex w-full items-center justify-between gap-3 text-left transition-all hover:border-emerald-500/40"
      >
        <span className="flex items-center gap-2 text-sm text-white">
          <CalendarRange className="h-4 w-4 text-emerald-400" />
          {formatValue(value)}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
          Range
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+0.5rem)] z-[9999] w-[min(24rem,calc(100vw-2rem))] rounded-[2rem] border border-white/10 bg-slate-900/80 p-6 shadow-[0_0_50px_rgba(0,0,0,0.4)] ring-1 ring-white/10 backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-300 sm:w-[22rem]">
          <div className="flex items-center justify-between mb-6">
            <button
              type="button"
              onClick={() => setVisibleMonth((current) => subMonths(current, 1))}
              className="rounded-xl border border-white/5 bg-white/5 p-2 text-slate-400 transition-all hover:bg-white/10 hover:text-white active:scale-95"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-bold tracking-tight text-white uppercase tracking-[0.1em]">
              {format(visibleMonth, "MMMM yyyy")}
            </p>
            <button
              type="button"
              onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
              className="rounded-xl border border-white/5 bg-white/5 p-2 text-slate-400 transition-all hover:bg-white/10 hover:text-white active:scale-95"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const isPast = minDate && isBefore(day, minDate);
              const isCurrentMonth = isSameMonth(day, visibleMonth);
              const inRange =
                startDate &&
                endDate &&
                !isBefore(day, startDate) &&
                !isAfter(day, endDate);
              const selected =
                (startDate && isSameDay(day, startDate)) ||
                (endDate && isSameDay(day, endDate));

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => applyRange(day)}
                  disabled={Boolean(isPast)}
                  className={clsx(
                    "flex h-10 items-center justify-center rounded-xl text-sm transition-all relative group",
                    isPast
                      ? "text-slate-700 cursor-not-allowed"
                      : selected
                      ? "bg-emerald-500 font-bold text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.4)]"
                      : inRange
                      ? "bg-emerald-500/15 text-emerald-300"
                      : isCurrentMonth
                      ? "text-slate-300 hover:bg-white/10 hover:text-white"
                      : "text-slate-600 hover:text-slate-400"
                  )}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const start = format(startOfToday(), "yyyy-MM-dd");
                const end = format(addDays(startOfToday(), 6), "yyyy-MM-dd");
                onChange({ startDate: start, endDate: end });
                setVisibleMonth(startOfToday());
                setOpen(false);
              }}
              className="flex-1 rounded-xl border border-white/5 bg-white/5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 transition-all hover:bg-white/10 hover:text-white active:scale-[0.98]"
            >
              Next 7 days
            </button>
            <button
              type="button"
              onClick={() => {
                onChange({ startDate: null, endDate: null });
                setOpen(false);
              }}
              className="rounded-xl border border-white/5 bg-white/5 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 transition-all hover:bg-white/10 hover:text-rose-400 active:scale-[0.98]"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
