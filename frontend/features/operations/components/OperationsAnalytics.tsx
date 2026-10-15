"use client";

import { memo, useMemo } from "react";
import { OperationsDashboard as OperationsDashboardData } from "../types";

interface OperationsAnalyticsProps {
  data?: OperationsDashboardData;
  isLoading: boolean;
}

export const OperationsAnalytics = memo(({ data, isLoading }: OperationsAnalyticsProps) => {
  const statusDistribution = useMemo(() => data?.status_distribution ?? [], [data?.status_distribution]);
  const dailyTrend = useMemo(() => data?.daily_trend ?? [], [data?.daily_trend]);
  const maxDailyCount = Math.max(...dailyTrend.map((item) => item.count), 1);

  const pieStops = useMemo(() => {
    const colors = ["#38bdf8", "#818cf8", "#34d399", "#fbbf24", "#f43f5e", "#94a3b8"];
    let offset = 0;
    return statusDistribution
      .map((item, index) => {
        const next = offset + item.percent;
        const segment = `${colors[index % colors.length]} ${offset}% ${next}%`;
        offset = next;
        return segment;
      })
      .join(", ");
  }, [statusDistribution]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="ui-card ui-card-elevated border-slate-800 bg-slate-950/40 p-6">
        <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Queue Distribution</h3>
        <div className="mt-8 flex flex-col items-center gap-8 sm:flex-row sm:justify-around">
          <div
            className="relative h-32 w-32 rounded-full"
            style={{ background: statusDistribution.length ? `conic-gradient(${pieStops})` : "#1e293b" }}
          >
            <div className="absolute inset-4 rounded-full bg-slate-950 flex items-center justify-center">
              <div className="text-center">
                <p className="text-xl font-bold text-white">{data?.queue.length ?? 0}</p>
                <p className="text-[8px] uppercase text-slate-500">Total</p>
              </div>
            </div>
          </div>
          <div className="flex-1 space-y-2">
            {statusDistribution.slice(0, 4).map((item, index) => (
              <div key={item.status} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: ["#38bdf8", "#818cf8", "#34d399", "#fbbf24"][index % 4] }} />
                  <span className="text-[10px] font-medium text-slate-300">{item.status}</span>
                </div>
                <span className="text-[10px] font-bold text-slate-500">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="ui-card ui-card-elevated border-slate-800 bg-slate-950/40 p-6">
        <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Arrival Trends (7d)</h3>
        <div className="mt-8 flex h-32 items-end justify-between gap-1.5">
          {dailyTrend.map((item) => (
            <div key={item.day} className="group relative flex flex-1 flex-col items-center">
              <div
                className="w-full rounded-t-md bg-sky-500/20 transition-all group-hover:bg-sky-500/40"
                style={{ height: `${(item.count / maxDailyCount) * 100}%`, minHeight: "2px" }}
              />
              <p className="mt-2 text-[8px] font-medium text-slate-500 truncate w-full text-center">{item.day}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

OperationsAnalytics.displayName = "OperationsAnalytics";
