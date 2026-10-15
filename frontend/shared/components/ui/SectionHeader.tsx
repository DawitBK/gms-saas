'use client';

import type { ReactNode } from 'react';
import clsx from 'clsx';

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  titleClassName?: string;
};

export function SectionHeader({ title, subtitle, action, className, titleClassName }: SectionHeaderProps) {
  return (
    <div className={clsx('flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between', className)}>
      <div className="min-w-0">
        <h2 className={clsx('text-xl font-semibold text-white', titleClassName)}>{title}</h2>
        {subtitle ? <p className="mt-2 text-sm text-slate-400">{subtitle}</p> : null}
      </div>
      {action ? <div className="w-full sm:w-auto">{action}</div> : null}
    </div>
  );
}

