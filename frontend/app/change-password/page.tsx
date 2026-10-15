"use client";

import { FormEvent, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useChangePassword } from "@features/auth/hooks";
import { useAuthStore } from "@state/auth.store";
import { 
  Loader2, 
  Lock, 
  ShieldAlert, 
  CheckCircle2, 
  Eye, 
  EyeOff, 
  ArrowRight,
  ShieldCheck,
  AlertCircle
} from "lucide-react";
import { Field } from "@shared/components/ui/Field";

export default function ChangePasswordPage() {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const authenticated = useAuthStore((s) => s.authenticated);
  const requiresPasswordChange = useAuthStore((s) => s.requiresPasswordChange);
  const clearSession = useAuthStore((s) => s.clearSession);
  
  const changePasswordMutation = useChangePassword();

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (hydrated && (!authenticated || !requiresPasswordChange)) {
      if (authenticated && !requiresPasswordChange) {
        router.replace("/select-role");
      } else if (!authenticated) {
        router.replace("/login");
      }
    }
  }, [hydrated, authenticated, requiresPasswordChange, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    try {
      await changePasswordMutation.mutateAsync({
        old_password: oldPassword,
        new_password: newPassword,
      });
      
      setSuccess(true);
      
      // Update store state manually or force a re-login
      useAuthStore.setState({ requiresPasswordChange: false });
      
      setTimeout(() => {
        router.push("/select-role");
      }, 2000);
    } catch (err: any) {
      setError(
        err.response?.data?.message || 
        err.response?.data?.error?.message || 
        "Failed to update password. Please check your current password."
      );
    }
  };

  if (!hydrated) return null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 selection:bg-indigo-500/30">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -left-[10%] -top-[10%] h-[500px] w-[500px] rounded-full bg-indigo-600/10 blur-[120px]" />
        <div className="absolute -right-[10%] -bottom-[10%] h-[500px] w-[500px] rounded-full bg-violet-600/10 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-500/10 text-amber-500 shadow-2xl shadow-amber-500/20">
            <ShieldAlert className="h-10 w-10" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Security Required
          </h1>
          <p className="mt-3 text-slate-400">
            Your account is flagged for a mandatory password change. 
            Please set a new secure password to continue.
          </p>
        </div>

        <div className="rounded-[2.5rem] border border-white/10 bg-slate-900/50 p-8 backdrop-blur-xl shadow-2xl">
          {success ? (
            <div className="py-12 text-center animate-in fade-in zoom-in-95 duration-500">
              <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 shadow-2xl shadow-emerald-500/20">
                <CheckCircle2 className="h-12 w-12" />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Security Updated</h2>
              <p className="mt-3 text-slate-400">Your password has been changed successfully. Redirecting you to your workspace...</p>
              <div className="mt-8 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-6">
              <Field label="Current Password">
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                  <input
                    type={showOld ? "text" : "password"}
                    required
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="ui-input pl-12 pr-12"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowOld(!showOld)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                  >
                    {showOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>

              <div className="h-px bg-white/5 mx-2" />

              <div className="space-y-5">
                <Field label="New Secure Password">
                  <div className="relative">
                    <ShieldCheck className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                    <input
                      type={showNew ? "text" : "password"}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      className="ui-input pl-12 pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(!showNew)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                    >
                      {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>

                <Field label="Confirm New Password">
                  <div className="relative">
                    <ShieldCheck className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat new password"
                      className="ui-input pl-12"
                    />
                  </div>
                </Field>
              </div>

              {error && (
                <div className="flex items-center gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-400 animate-in fade-in slide-in-from-top-2">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={changePasswordMutation.isPending}
                className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-indigo-500 py-4 font-bold text-white shadow-xl shadow-indigo-500/20 transition-all hover:bg-indigo-400 active:scale-[0.98] disabled:opacity-50"
              >
                {changePasswordMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    Update Security
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </button>
              
              <button
                type="button"
                onClick={() => {
                  clearSession();
                  router.push("/login");
                }}
                className="w-full text-center text-sm font-medium text-slate-500 hover:text-slate-300 transition-colors"
              >
                Cancel and Logout
              </button>
            </form>
          )}
        </div>
        
        <p className="mt-8 text-center text-xs text-slate-600 uppercase tracking-widest">
          &copy; {new Date().getFullYear()} Example Corp Enterprise Security
        </p>
      </div>
    </main>
  );
}
