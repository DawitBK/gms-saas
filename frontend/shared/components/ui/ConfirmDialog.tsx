"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "default";
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onCancel]);

  return (
    <AnimatePresence>
      {isOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
          <motion.button
            type="button"
            aria-label="Close confirmation"
            className="absolute inset-0 bg-slate-950/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            className="relative w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <h2 id="confirm-dialog-title" className="text-base font-semibold">
              {title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={clsx(
                  "rounded-md px-3 py-2 text-sm font-medium text-white",
                  variant === "danger" && "bg-red-600",
                  variant === "warning" && "bg-amber-600",
                  variant === "default" && "bg-emerald-700",
                )}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
