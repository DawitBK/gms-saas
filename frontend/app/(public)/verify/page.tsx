"use client";

import { FormEvent, useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  useVerifyRegistration,
  useResendVerification,
  useUpdateRegistrationEmail,
} from "@features/auth/hooks";
import { useAuthStore } from "@state/auth.store";
import {
  Loader2,
  ArrowRight,
  Mail,
  ShieldCheck,
  Pencil,
  RefreshCw,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { assetPath } from "@shared/lib/asset-path";

// Fallback only — the backend always returns the real otpExpiresAt from the
// register/resend/update-email responses. This constant exists purely so the
// countdown has something sane to render if that value is ever missing; it
// must never be treated as the source of truth for how long the code lasts.
const FALLBACK_OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function parseExpiry(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((state) => state.setSession);
  const verifyMutation = useVerifyRegistration();
  const resendMutation = useResendVerification();
  const updateEmailMutation = useUpdateRegistrationEmail();

  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [expiresAt, setExpiresAt] = useState<number>(
    () =>
      parseExpiry(searchParams.get("otpExpiresAt")) ??
      Date.now() + FALLBACK_OTP_TTL_MS,
  );

  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!email) {
      router.push("/");
    }
  }, [email, router]);

  // Single ticking clock drives both the OTP countdown and the resend
  // cooldown — both are derived from timestamps rather than their own
  // decrementing counters.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const remainingMs = expiresAt - now;
  const isExpired = remainingMs <= 0;
  const resendCooldownRemainingMs = Math.max(0, resendAvailableAt - now);
  const canResend = resendCooldownRemainingMs <= 0 && !resendMutation.isPending;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (isExpired) {
      setError("Your code has expired — request a new one.");
      return;
    }

    if (otp.length !== 6) {
      setError("Please enter the 6-digit verification code.");
      return;
    }

    try {
      const payload = await verifyMutation.mutateAsync({ email, otp });
      setSession({
        accessToken: payload.accessToken,
        userId: payload.user.id,
        roles: payload.user.roles ?? [],
        officeId: payload.user.office_id ?? null,
      });

      // Redirect to dashboard on success
      router.push("/dashboard");
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error?.message ||
          "Verification failed. Please check the code and try again.",
      );
    }
  };

  const onResend = async () => {
    if (!canResend) return;
    setError(null);
    setResendNotice(null);

    try {
      const result = await resendMutation.mutateAsync({ email });
      setOtp("");
      setExpiresAt(parseExpiry(result.otpExpiresAt) ?? Date.now() + FALLBACK_OTP_TTL_MS);
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_MS);
      setResendNotice("A new code was sent.");
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error?.message ||
          "Could not resend the code. Please try again shortly.",
      );
    }
  };

  const onSaveNewEmail = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setEmailNotice(null);

    const trimmed = newEmailInput.trim();
    if (!trimmed) {
      setError("Please enter an email address.");
      return;
    }
    if (!confirmPassword) {
      setError("Please confirm your password to change the email address.");
      return;
    }

    try {
      const result = await updateEmailMutation.mutateAsync({
        email,
        newEmail: trimmed,
        password: confirmPassword,
      });
      setEmail(result.email);
      setOtp("");
      setExpiresAt(parseExpiry(result.otpExpiresAt) ?? Date.now() + FALLBACK_OTP_TTL_MS);
      setIsEditingEmail(false);
      setNewEmailInput("");
      setConfirmPassword("");
      setResendAvailableAt(0);
      setEmailNotice("Code sent to the new address.");
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error?.message ||
          "Could not update the email address. Please try again.",
      );
    }
  };

  return (
    <div className="relative z-10 w-full max-w-md">
      <div className="mb-10 flex flex-col items-center text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-white shadow-2xl overflow-hidden animate-pulse">
          <img
            src={assetPath("/assets/logo.png")}
            alt="Example Corp Logo"
            width="64"
            height="64"
            className="object-contain"
          />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Verify Your Identity
        </h1>
        <p className="mt-3 text-slate-400 max-w-xs mx-auto">
          We&apos;ve sent a 6-digit verification code to{" "}
          <span className="text-cyan-400 font-medium">{email}</span>.
        </p>

        {!isEditingEmail ? (
          <div className="mt-2 flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setIsEditingEmail(true);
                setNewEmailInput(email);
                setError(null);
                setEmailNotice(null);
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-400 transition-colors hover:text-cyan-300"
            >
              <Pencil className="h-3 w-3" />
              Not your email? Edit
            </button>
            <p className="text-[11px] text-slate-600">
              Make sure this is correct — you can edit it above if not.
            </p>
          </div>
        ) : (
          <form
            onSubmit={onSaveNewEmail}
            className="mt-4 w-full space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4"
          >
            <label className="block text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              Correct email address
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                value={newEmailInput}
                onChange={(e) => setNewEmailInput(e.target.value)}
                placeholder="you@company.com"
                className="ui-input pl-11"
                autoFocus
              />
            </div>
            {/* Required by the backend since 2026-09-04. Without it this form
                let anyone re-point a stranger's pending registration at their
                own inbox and then complete verification, which auto-issues a
                session — full account takeover with no password. The password
                was chosen minutes ago on the registration screen, so asking
                for it here costs the real user nothing. */}
            <label className="block text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              Confirm your password
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="The password you just set"
                autoComplete="current-password"
                className="ui-input pl-11"
              />
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                type="submit"
                disabled={updateEmailMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-70"
              >
                {updateEmailMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Save"
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditingEmail(false);
                  setNewEmailInput("");
                  setConfirmPassword("");
                }}
                className="text-xs font-medium text-slate-500 transition-colors hover:text-slate-300"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {emailNotice && (
          <p className="mt-2 flex items-center gap-1 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {emailNotice}
          </p>
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <div className="space-y-4">
          <label className="block text-sm font-semibold uppercase tracking-widest text-slate-500 text-center mb-4">
            Enter Verification Code
          </label>
          <div className="relative">
            <ShieldCheck className="absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="_ _ _ _ _ _"
              className="ui-input pl-14 text-center text-2xl tracking-[0.5em] font-mono h-16"
              autoFocus
              disabled={isExpired}
            />
          </div>

          <div className="text-center text-xs">
            {isExpired ? (
              <span className="font-semibold text-red-400">
                Your code has expired — request a new one.
              </span>
            ) : (
              <span className="text-slate-500">
                Code expires in{" "}
                <span className="font-mono font-semibold text-cyan-400">
                  {formatCountdown(remainingMs)}
                </span>
              </span>
            )}
          </div>

          <div className="flex flex-col items-center gap-1 pt-1">
            <button
              type="button"
              onClick={onResend}
              disabled={!canResend}
              className="inline-flex items-center gap-2 text-xs font-semibold text-cyan-400 transition hover:text-cyan-300 disabled:cursor-not-allowed disabled:text-slate-600"
            >
              {resendMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {resendCooldownRemainingMs > 0
                ? `Resend available in ${Math.ceil(resendCooldownRemainingMs / 1000)}s`
                : "Resend code"}
            </button>
            {resendNotice && (
              <p className="flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {resendNotice}
              </p>
            )}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400 text-center animate-in fade-in slide-in-from-top-1"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={verifyMutation.isPending || isExpired}
          className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-cyan-500 py-4 font-bold text-slate-950 transition-all hover:bg-cyan-400 disabled:opacity-70 active:scale-[0.98] shadow-lg shadow-cyan-500/20"
        >
          {verifyMutation.isPending ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <>
              Confirm & Login
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => router.push("/")}
          className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-400"
        >
          Start over instead
        </button>
      </form>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-slate-950 text-slate-100 selection:bg-cyan-500/30 px-6">
      {/* Decorative background elements */}
      <div className="absolute inset-0 bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-950 z-0" />
      <div className="absolute -left-1/4 top-1/4 h-[600px] w-[600px] rounded-full bg-cyan-600/10 blur-[150px] mix-blend-screen pointer-events-none z-0" />
      <div className="absolute -right-1/4 bottom-1/4 h-[600px] w-[600px] rounded-full bg-blue-600/10 blur-[150px] mix-blend-screen pointer-events-none z-0" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full opacity-[0.03] pointer-events-none z-0" />

      <Suspense
        fallback={<Loader2 className="h-10 w-10 animate-spin text-cyan-500" />}
      >
        <VerifyContent />
      </Suspense>
    </main>
  );
}
