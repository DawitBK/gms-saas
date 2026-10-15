"use client";

import { useState } from "react";
import { ShieldAlert, Loader2, X, Lock } from "lucide-react";
import { authApi } from "@features/auth/api";
import { toast } from "sonner";

interface PasswordConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  actionLabel?: string;
}

export function PasswordConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm Identity",
  description = "This is a sensitive operation. Please enter your password to proceed.",
  actionLabel = "Confirm Action",
}: PasswordConfirmModalProps) {
  const [password, setPassword] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!password) return;

    setIsVerifying(true);
    try {
      await authApi.verifyPassword(password);
      toast.success("Identity verified");
      setPassword("");
      onConfirm();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Invalid password. Access denied.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-[2.5rem] border border-rose-500/30 bg-slate-900 p-8 shadow-2xl shadow-rose-500/10">
        <button
          onClick={onClose}
          className="absolute right-6 top-6 rounded-full p-2 text-slate-500 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-rose-500/10 text-rose-400 mb-6 ring-1 ring-rose-500/20">
            <ShieldAlert className="h-8 w-8" />
          </div>
          
          <h2 className="text-2xl font-bold text-white tracking-tight">{title}</h2>
          <p className="mt-3 text-slate-400 text-sm leading-relaxed">
            {description}
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && password && !isVerifying) {
                  handleSubmit(e as any);
                }
              }}
              placeholder="Enter your password"
              className="w-full rounded-2xl border border-slate-800 bg-slate-950 py-4 pl-12 pr-4 text-white placeholder-slate-600 outline-none transition focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/20"
              required
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-slate-800 bg-slate-950 py-4 font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={(e) => handleSubmit(e as any)}
              disabled={isVerifying || !password}
              className="flex-1 rounded-2xl bg-rose-600 py-4 font-bold text-white shadow-lg shadow-rose-600/20 hover:bg-rose-500 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {isVerifying ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                actionLabel
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
