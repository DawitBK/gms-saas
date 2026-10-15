'use client';

import clsx from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

type UIButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClassMap: Record<ButtonVariant, string> = {
  primary: 'ui-btn-primary',
  secondary: 'ui-btn-secondary',
  danger: 'ui-btn-danger',
  ghost: 'ui-btn-ghost',
};

export function UIButton({ variant = 'secondary', className, ...props }: UIButtonProps) {
  return <button className={clsx('ui-btn', variantClassMap[variant], className)} {...props} />;
}

