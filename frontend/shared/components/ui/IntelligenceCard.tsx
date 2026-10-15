import { ReactNode } from "react";
import { clsx } from "clsx";

interface IntelligenceCardProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}

export function IntelligenceCard({ title, icon, children, className }: IntelligenceCardProps) {
  return (
    <div className={clsx("space-y-4", className)}>
      <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-content-dimmed flex items-center gap-2">
        {icon} {title}
      </h4>
      <div className="space-y-3">
        {children}
      </div>
    </div>
  );
}

interface InfoBlockProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: ReactNode;
  variant?: "default" | "highlight" | "success" | "warning";
}

export function InfoBlock({ label, value, subValue, icon, variant = "default" }: InfoBlockProps) {
  return (
    <div className={clsx(
      "rounded-2xl-enterprise p-4 border relative overflow-hidden group transition-all duration-300",
      variant === "default" && "bg-surface-card/50 border-surface-border/50 hover:bg-surface-card/80 hover:border-brand-primary/30",
      variant === "highlight" && "bg-brand-primary/5 border-brand-primary/20 hover:bg-brand-primary/10 hover:border-brand-primary/40",
      variant === "success" && "bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10 hover:border-emerald-500/40",
      variant === "warning" && "bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10 hover:border-amber-500/40"
    )}>
      {icon && (
        <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-20 transition-opacity text-brand-primary">
          {icon}
        </div>
      )}
      <p className="text-[10px] font-bold text-content-dimmed uppercase tracking-tight mb-2">
        {label}
      </p>
      <p className={clsx(
        "font-semibold text-base transition-colors",
        variant === "success" ? "text-emerald-400" : variant === "highlight" ? "text-brand-accent" : "text-content-base"
      )}>
        {value}
      </p>
      {subValue && (
        <p className="text-content-muted text-sm mt-0.5 truncate">
          {subValue}
        </p>
      )}
    </div>
  );
}
