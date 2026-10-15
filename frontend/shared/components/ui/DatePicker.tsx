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
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { useResetOnChange } from '@shared/hooks/useResetOnChange';

type DatePickerProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  minDate?: Date | null;
  placeholder?: string;
  disabled?: boolean;
};

function toDate(value: string | null) {
  return value ? parseISO(value) : null;
}

export function DatePicker({ 
  value, 
  onChange, 
  minDate, 
  placeholder = "Select date", 
  disabled = false 
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => toDate(value) ?? startOfToday());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedDate = toDate(value);

  // Show the month containing the selected date whenever the popover opens.
  // During render, so the calendar never flashes the previous month first.
  useResetOnChange([open, value], () => {
    if (!open) return;
    setVisibleMonth(toDate(value) ?? startOfToday());
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

  return (
    <div ref={containerRef} className="relative z-30">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={clsx(
          "ui-input flex w-full items-center gap-3 text-left transition-all hover:border-cyan-500/40",
          disabled && "opacity-50 cursor-not-allowed bg-slate-900"
        )}
      >
        <Calendar className="h-4 w-4 text-cyan-300 drop-shadow-[0_0_3px_rgba(34,211,238,0.5)] shrink-0" />
        <span className={clsx("flex-1 text-sm truncate", !value && "text-slate-500")}>
          {value ? format(parseISO(value), "MMM d, yyyy") : placeholder}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+0.5rem)] z-[9999] w-[320px] rounded-[2rem] border border-white/10 bg-slate-900/80 p-6 shadow-[0_0_50px_rgba(0,0,0,0.4)] ring-1 ring-white/10 backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-300">
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
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const isPast = minDate && isBefore(day, minDate) && !isSameDay(day, minDate);
              const isCurrentMonth = isSameMonth(day, visibleMonth);
              const isSelected = selectedDate && isSameDay(day, selectedDate);

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => {
                    onChange(format(day, "yyyy-MM-dd"));
                    setOpen(false);
                  }}
                  disabled={Boolean(isPast)}
                  className={clsx(
                    "flex h-9 w-9 items-center justify-center rounded-xl text-sm transition-all relative group",
                    isPast
                      ? "text-slate-700 cursor-not-allowed"
                      : isSelected
                      ? "bg-cyan-500 font-bold text-slate-950 shadow-[0_0_15px_rgba(34,211,238,0.4)]"
                      : isCurrentMonth
                      ? "text-slate-300 hover:bg-white/10 hover:text-white"
                      : "text-slate-600 hover:text-slate-400"
                  )}
                >
                  {format(day, "d")}
                  {isSameDay(day, new Date()) && !isSelected && (
                    <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-cyan-400/50" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={() => {
                onChange(format(new Date(), "yyyy-MM-dd"));
                setOpen(false);
              }}
              className="flex-1 rounded-xl border border-white/5 bg-white/5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 transition-all hover:bg-white/10 hover:text-white active:scale-[0.98]"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="flex-1 rounded-xl border border-white/5 bg-white/5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 transition-all hover:bg-white/10 hover:text-rose-400 active:scale-[0.98]"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
