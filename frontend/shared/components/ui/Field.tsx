'use client';

import clsx from 'clsx';
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';

export function UITextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx('ui-input', props.className)} />;
}

export function UISelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx('ui-input', props.className)} />;
}

export function UITextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx('ui-input', props.className)} />;
}

export interface FieldProps {
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
  optional?: boolean;
}

export function Field({ label, error, children, className, optional }: FieldProps) {
  return (
    <label className={clsx('block', className)}>
      <div className="flex justify-between items-center mb-2">
        <span className="block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
          {label}
        </span>
        {optional && (
          <span className="text-[10px] text-slate-600 font-medium uppercase tracking-wider">Optional</span>
        )}
      </div>
      {children}
      {error && (
        <p className="mt-1.5 text-xs font-medium text-rose-400 animate-in fade-in slide-in-from-top-1">
          {error}
        </p>
      )}
    </label>
  );
}
