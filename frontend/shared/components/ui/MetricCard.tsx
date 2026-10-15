import Link from "next/link";
import type { ComponentType } from "react";
import clsx from "clsx";

type MetricCardProps = {
  label: string;
  value: number | string;
  icon: ComponentType<{ className?: string }>;
  toneClassName?: string;
  href?: string;
};

export function MetricCard({
  label,
  value,
  icon: Icon,
  toneClassName = "text-sky-400",
  href,
}: MetricCardProps) {
  const content = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-300">{label}</p>
        <Icon className={clsx("h-5 w-5", toneClassName)} aria-hidden="true" />
      </div>
      <p
        className="mt-3 text-2xl font-bold text-white sm:mt-4 sm:text-3xl"
        aria-live="polite"
      >
        {value}
      </p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="ui-card ui-card-elevated p-4 sm:p-5 transition hover:-translate-y-0.5 hover:border-slate-700 focus:ring-2 focus:ring-sky-500 outline-none block"
        aria-label={`${label} metric, click to view details`}
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      className="ui-card ui-card-elevated p-4 sm:p-5"
      role="region"
      aria-label={`${label} metric`}
    >
      {content}
    </div>
  );
}
