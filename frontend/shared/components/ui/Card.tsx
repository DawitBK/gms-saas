import clsx from 'clsx';
import type { PropsWithChildren } from 'react';

type CardProps = PropsWithChildren<{
  className?: string;
  elevated?: boolean;
}>;

export function Card({ className, elevated = true, children }: CardProps) {
  return <section className={clsx('ui-card', elevated && 'ui-card-elevated', className)}>{children}</section>;
}

