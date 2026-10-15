"use client";

import { FormEvent, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  useLogin,
  useForgotPassword,
  useResetPassword,
  useVerify2fa,
} from "@features/auth/hooks";
import { useAuthStore } from "@state/auth.store";
import {
  canAccessPathForRole,
  getPortalPathForRole,
} from "@shared/lib/auth-redirect";
import { normalizeRoles } from "@shared/lib/roles";
import { resolveSsoLoginUrl } from "@shared/lib/sso-login-url";
import {
  Loader2,
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  Mail,
  Lock,
  ShieldCheck,
  Sparkles,
  Fingerprint,
  RotateCcw,
  X,
  CheckCircle2,
} from "lucide-react";

import { Field } from "@shared/components/ui/Field";
import { assetPath } from "@shared/lib/asset-path";
import { useQueryParam } from '@shared/hooks/useQueryParam';

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const roles = useAuthStore((state) => state.roles);
  const selectedRole = useAuthStore((state) => state.selectedRole);
  const loginMutation = useLogin();
  const forgotMutation = useForgotPassword();
  const resetMutation = useResetPassword();
  const verify2faMutation = useVerify2fa();

  // Derived, never set anywhere else — so it is read straight from the URL
  // rather than copied into state by a mount effect.
  const nextPath = useQueryParam("next");

  const authenticated = useAuthStore((state) => state.authenticated);

  useEffect(() => {
    // Only redirect away from login if there's an active session.
    // After sign-out, clearSession() clears this flag — even if roles remain
    // briefly in memory, we must NOT redirect away or we get an auth loop.
    //
    // P1-21: this tested `accessToken`, which is now memory-only and therefore
    // null on every fresh load — including the load that follows a bridged SSO
    // handoff. Gating on it here would have stranded an already-signed-in user
    // on the login page until some other request happened to refresh the token.
    // `authenticated` survives the reload and is what clearSession() resets.
    if (!roles.length || !authenticated) {
      return;
    }

    if (roles.length > 1 && !selectedRole) {
      router.push("/select-role");
    } else if (roles.length === 1) {
      // Auto-select single role
      useAuthStore.getState().setSelectedRole(roles[0]);
    }
  }, [roles, selectedRole, router, authenticated]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // The mount reset that used to sit here set both fields to the empty strings
  // they are already initialised with, so it never changed anything — it could
  // not clear a browser autofill either, since the browser fills the DOM input
  // and React only reads its own state. Removed rather than rewritten.

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Security Flow States
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [requires2fa, setRequires2fa] = useState(false);
  const [mfaEmail, setMfaEmail] = useState("");
  const [mfaOtp, setMfaOtp] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    try {
      const payload = await loginMutation.mutateAsync({ email, password });

      if ((payload as any).requires_2fa) {
        setRequires2fa(true);
        setMfaEmail((payload as any).email);
        return;
      }

      const normalizedRoles = normalizeRoles(payload.user.roles ?? []);
      setSession({
        accessToken: payload.accessToken,
        userId: payload.user.id,
        roles: normalizedRoles,
        officeId: payload.user.office_id ?? null,
        requiresPasswordChange: !!payload.requires_password_change,
      });

      if (payload.requires_password_change) {
        router.push("/change-password");
        return;
      }

      // Redirect based on role
      if (normalizedRoles.length > 1) {
        router.push(
          nextPath
            ? `/select-role?next=${encodeURIComponent(nextPath)}`
            : "/select-role",
        );
      } else {
        const singleRole = normalizedRoles[0] ?? "guest";
        router.push(
          nextPath && canAccessPathForRole(nextPath, singleRole)
            ? nextPath
            : getPortalPathForRole(singleRole),
        );
      }
    } catch (err: any) {
      const backendError = err.response?.data?.error;
      if (backendError?.details && Array.isArray(backendError.details)) {
        const mappedErrors: Record<string, string> = {};
        backendError.details.forEach((detail: any) => {
          if (detail.path) {
            const path = detail.path.replace(/^body\./, "");
            mappedErrors[path] = detail.message;
          }
        });
        setFieldErrors(mappedErrors);
      }
      setError(
        err.response?.data?.message ||
          err.response?.data?.error?.message ||
          "Login failed. Please verify your credentials and try again.",
      );
    }
  };

  const onVerify2fa = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = await verify2faMutation.mutateAsync({
        email: mfaEmail,
        otp: mfaOtp,
      });
      const normalizedRoles = normalizeRoles(payload.user.roles ?? []);
      setSession({
        accessToken: payload.accessToken,
        userId: payload.user.id,
        roles: normalizedRoles,
        officeId: payload.user.office_id ?? null,
        requiresPasswordChange: !!payload.requires_password_change,
      });

      if (payload.requires_password_change) {
        router.push("/change-password");
        return;
      }

      if (normalizedRoles.length > 1) {
        router.push(
          nextPath
            ? `/select-role?next=${encodeURIComponent(nextPath)}`
            : "/select-role",
        );
      } else {
        const singleRole = normalizedRoles[0] ?? "guest";
        router.push(
          nextPath && canAccessPathForRole(nextPath, singleRole)
            ? nextPath
            : getPortalPathForRole(singleRole),
        );
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "2FA Verification failed.");
    }
  };

  return (
    <main className="flex min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500/30">
      {/* Left Pane - Branding & Ambient Atmosphere */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-slate-900 lg:flex">
        {/* Abstract 3D Liquid/Gradient Mesh */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 z-0" />
        <div className="absolute -left-[20%] top-[-10%] h-[800px] w-[800px] rounded-full bg-indigo-600/20 blur-[140px] mix-blend-screen pointer-events-none z-0" />
        <div className="absolute -right-[10%] bottom-[-20%] h-[600px] w-[600px] rounded-full bg-violet-600/10 blur-[120px] mix-blend-screen pointer-events-none z-0" />

        {/* Content Overlay */}
        <div className="relative z-10 flex flex-1 flex-col items-start justify-center px-16 xl:px-24">
          <div className="mb-10 flex h-[15vw] w-[15vw] max-h-[220px] max-w-[220px] min-h-[120px] min-w-[120px] items-center justify-center rounded-[2rem] bg-white text-white shadow-2xl shadow-indigo-500/30 overflow-hidden">
            <img
              src={assetPath("/assets/logo.png")}
              alt="Example Corp Logo"
              width="220"
              height="220"
              className="object-contain"
            />
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight text-white xl:text-6xl/tight">
            Example Corp <br />
            Enterprise{" "}
            <span className="bg-gradient-to-r from-indigo-400 to-violet-500 bg-clip-text text-transparent">
              GMS
            </span>
          </h1>
          <p className="mt-6 max-w-md text-lg text-slate-400 leading-relaxed tracking-wide">
            Securely authenticate to manage your operations, facilities, and
            guest coordination.
          </p>

          <div className="mt-12 grid w-full max-w-xl gap-4">
            {[
              {
                icon: ShieldCheck,
                title: "Role-aware workspace access",
                description:
                  "Admins, hosts, and reception teams land directly in their operational console after sign-in.",
              },
              {
                icon: Sparkles,
                title: "Live operational updates",
                description:
                  "Approvals, credentials, and arrivals refresh automatically across dashboards.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-3xl border border-white/5 bg-white/5 p-5 backdrop-blur-sm"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/15">
                      <Icon
                        className="h-5 w-5 text-indigo-300"
                        aria-hidden="true"
                      />
                    </div>
                    <div>
                      <p className="font-medium text-white">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-400">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative z-10 px-16 pb-12 xl:px-24">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
            Authorization Gateway Live
          </p>
          <p className="mt-2 text-xs text-slate-600 uppercase tracking-widest">
            &copy; {new Date().getFullYear()} Example Corp
          </p>
        </div>
      </div>

      {/* Right Pane - Login Interface */}
      <div className="relative flex w-full flex-col items-center justify-center overflow-y-auto bg-slate-950 px-6 py-8 sm:px-12 lg:w-1/2">
        {/* Mobile-only background accents */}
        <div className="absolute top-0 right-0 h-[400px] w-[400px] rounded-full bg-indigo-600/10 blur-[100px] lg:hidden" />

        <div className="relative z-10 w-full max-w-md">
          <div className="mb-10 lg:hidden">
            <div className="mb-6 flex h-[18vw] w-[18vw] max-h-[160px] max-w-[160px] min-h-[96px] min-w-[96px] items-center justify-center rounded-2xl bg-white shadow-xl overflow-hidden">
              <img
                src={assetPath("/assets/logo.png")}
                alt="Example Corp Logo"
                width="140"
                height="140"
                className="object-contain"
              />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Staff Login
            </h1>
            <p className="mt-2 text-slate-400">Access the GMS portal.</p>
          </div>

          <div className="hidden lg:block mb-10">
            <h2 className="text-3xl font-semibold tracking-tight text-white">
              Staff Login
            </h2>
            <p className="mt-2 text-slate-400">
              Sign in to your corporate account.
            </p>
          </div>

          <a
            href={resolveSsoLoginUrl()}
            className="group relative mb-6 flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-400/30 bg-indigo-500/10 py-3.5 font-semibold text-indigo-200 transition-all hover:bg-indigo-500/20 hover:text-white"
          >
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            Sign in with Example Corp SSO
          </a>

          <div className="mb-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-slate-800" />
            <span className="text-[11px] uppercase tracking-widest text-slate-500">
              or sign in with email
            </span>
            <span className="h-px flex-1 bg-slate-800" />
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-6">
              <Field label="Corporate Email" error={fieldErrors.email}>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@examplecorp.com"
                    autoComplete="username"
                    className="ui-input pl-11"
                  />
                </div>
              </Field>

              <Field label="Account Password" error={fieldErrors.password}>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className="ui-input pl-11 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-full p-1 text-slate-400 transition hover:text-white"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <div className="flex justify-end mt-1">
                  <button
                    type="button"
                    onClick={() => setIsForgotModalOpen(true)}
                    className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
              </Field>
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
              disabled={loginMutation.isPending}
              aria-label={
                loginMutation.isPending ? "Authenticating..." : "Authenticate"
              }
              className="group relative mt-8 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-indigo-500 py-3.5 font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-400 disabled:opacity-70 disabled:hover:bg-indigo-500 active:scale-[0.98]"
            >
              {loginMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <>
                  <span className="relative z-10 flex items-center gap-2">
                    Authenticate
                    <ArrowRight
                      className="h-5 w-5 transition-transform group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </span>
                </>
              )}
            </button>

            <div className="mt-8 text-center">
              <p className="text-sm font-medium text-slate-400">
                Are you a Guest?{" "}
                <Link
                  href="/"
                  className="text-indigo-400 transition-colors hover:text-indigo-300 hover:underline"
                >
                  Register for access
                </Link>
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
              If your session expires or gets interrupted, we will bring you
              back here and preserve your destination when possible.
            </div>
          </form>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {isForgotModalOpen && (
        <ForgotPasswordModal
          onClose={() => setIsForgotModalOpen(false)}
          forgotMutation={forgotMutation}
          resetMutation={resetMutation}
        />
      )}

      {/* 2FA Verification View Overlay */}
      {requires2fa && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-6">
          <div className="w-full max-w-md space-y-8 rounded-3xl border border-white/10 bg-slate-900 p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400">
                <Fingerprint className="h-8 w-8" />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">
                Two-Step Verification
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                A verification code has been sent to{" "}
                <span className="text-indigo-300 font-medium">{mfaEmail}</span>.
              </p>
            </div>

            <form onSubmit={onVerify2fa} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Security Code
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={mfaOtp}
                  onChange={(e) => setMfaOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="ui-input text-center text-3xl font-mono tracking-[0.5em] h-16"
                  autoFocus
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400 text-center">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-3">
                <button
                  type="submit"
                  disabled={verify2faMutation.isPending}
                  className="flex h-12 w-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 font-bold text-white transition-all hover:bg-indigo-400 disabled:opacity-50"
                >
                  {verify2faMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Verify Identity"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setRequires2fa(false)}
                  className="text-sm font-medium text-slate-500 hover:text-slate-400 transition-colors"
                >
                  Cancel and sign in again
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

function ForgotPasswordModal({ onClose, forgotMutation, resetMutation }: any) {
  const [step, setStep] = useState(1); // 1: Email, 2: OTP + New Pass
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleRequest = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await forgotMutation.mutateAsync(email);
      setStep(2);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to send reset code.");
    }
  };

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await resetMutation.mutateAsync({ email, otp, password: newPassword });
      setSuccess(true);
      setTimeout(() => onClose(), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to reset password.");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-6">
      <div className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-8 shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
        <button
          onClick={onClose}
          className="absolute right-6 top-6 rounded-full p-2 text-slate-500 hover:bg-white/5 hover:text-white transition-all"
        >
          <X className="h-5 w-5" />
        </button>

        {success ? (
          <div className="py-10 text-center animate-in fade-in zoom-in-95">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Password Updated
            </h2>
            <p className="mt-3 text-slate-400">
              Your account has been secured. You can now log in with your new
              credentials.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 mb-4">
                <RotateCcw className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">
                Account Recovery
              </h2>
              <p className="mt-2 text-slate-400">
                {step === 1
                  ? "Enter your corporate email to receive a secure recovery code."
                  : "Verify your identity and choose a new secure password."}
              </p>
            </div>

            <form
              onSubmit={step === 1 ? handleRequest : handleReset}
              className="space-y-6"
            >
              {step === 1 ? (
                <Field label="Email Address">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@examplecorp.com"
                    className="ui-input"
                    autoFocus
                  />
                </Field>
              ) : (
                <div className="space-y-5">
                  <Field label="Recovery Code">
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={otp}
                      onChange={(e) =>
                        setOtp(e.target.value.replace(/\D/g, ""))
                      }
                      placeholder="000000"
                      className="ui-input text-center text-xl font-mono tracking-widest"
                      autoFocus
                    />
                  </Field>
                  <Field label="New Password">
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="ui-input"
                    />
                  </Field>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400 text-center">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={forgotMutation.isPending || resetMutation.isPending}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 font-bold text-white transition-all hover:bg-indigo-400 disabled:opacity-50"
              >
                {forgotMutation.isPending || resetMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : step === 1 ? (
                  "Send Recovery Code"
                ) : (
                  "Update Password"
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
