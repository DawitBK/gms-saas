"use client";

import { FormEvent, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useRegister } from "@features/auth/hooks";
import { useAuthStore } from "@state/auth.store";
import {
  Loader2,
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  Mail,
  Lock,
  Phone,
  User as UserIcon,
  Building,
  CreditCard,
  Upload,
  Camera,
  Check,
} from "lucide-react";
import { Field } from "@shared/components/ui/Field";
import { CameraScanner } from "@shared/components/ui/CameraScanner";
import { useScanDocument } from "@features/ocr/hooks";
import { assetPath } from "@shared/lib/asset-path";

export default function RegisterPage() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const registerMutation = useRegister();

  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    password: "",
    confirm_password: "",
    company: "",
    government_id: "",
    document_url: "",
  });

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const scanMutation = useScanDocument();

  // The mount reset that used to sit here set every field to the empty string
  // it is already initialised with above, so it never changed anything — and it
  // could not clear a browser autofill either, since the browser writes to the
  // DOM input while React only reads its own state. Removed rather than
  // rewritten.

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (formData.password !== formData.confirm_password) {
      setError("Passwords do not match.");
      return;
    }

    /*
    // Testing bypass: disable password complexity check
    const complexityRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!complexityRegex.test(formData.password)) {
      setError("Password must contain at least 8 characters, an uppercase letter, a lowercase letter, a number, and a special character.");
      return;
    }
    */

    try {
      const result = await registerMutation.mutateAsync(formData);
      // Success: Redirect to verification page with email (and the OTP's
      // expiry, if the API returned one) in query params. The verify page
      // must never hardcode the OTP TTL itself.
      const otpExpiresAt = result?.otpExpiresAt;
      const query = new URLSearchParams({ email: formData.email });
      if (otpExpiresAt) {
        query.set("otpExpiresAt", otpExpiresAt);
      }
      router.push(`/verify?${query.toString()}`);
    } catch (err: any) {
      const backendError = err.response?.data?.error;
      if (backendError?.details && Array.isArray(backendError.details)) {
        const mappedErrors: Record<string, string> = {};
        backendError.details.forEach((detail: any) => {
          if (detail.path) {
            // Remove 'body.' prefix if present from backend validation paths
            const path = detail.path.replace(/^body\./, "");
            mappedErrors[path] = detail.message;
          }
        });
        setFieldErrors(mappedErrors);
      }

      setError(
        err.response?.data?.message ||
          err.response?.data?.error?.message ||
          "Registration failed. Please try again.",
      );
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev) => ({
          ...prev,
          document_url: reader.result as string,
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleScanCapture = async (base64: string) => {
    setIsScannerOpen(false);
    setFormData((prev) => ({ ...prev, document_url: base64 }));

    try {
      const result = await scanMutation.mutateAsync({ image: base64 });
      if (result.success && result.data.extracted) {
        const { full_name, id_number } = result.data.extracted;
        setFormData((prev) => ({
          ...prev,
          full_name: full_name || prev.full_name,
          government_id: id_number || prev.government_id,
        }));
      }
    } catch (err) {
      console.error("OCR Auto-population failed:", err);
    }
  };

  return (
    <main className="flex min-h-screen bg-slate-950 text-slate-100 selection:bg-cyan-500/30">
      {/* Left Pane - Branding & Ambient Atmosphere */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-slate-900 lg:flex">
        {/* Abstract 3D Liquid/Gradient Mesh */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 z-0" />
        <div className="absolute -left-[20%] top-[-10%] h-[800px] w-[800px] rounded-full bg-cyan-600/20 blur-[140px] mix-blend-screen pointer-events-none z-0" />
        <div className="absolute -right-[10%] bottom-[-20%] h-[600px] w-[600px] rounded-full bg-blue-600/10 blur-[120px] mix-blend-screen pointer-events-none z-0" />

        {/* Content Overlay */}
        <div className="relative z-10 flex flex-1 flex-col items-start justify-center px-16 xl:px-24">
          <div className="mb-10 flex h-[15vw] w-[15vw] max-h-[220px] max-w-[220px] min-h-[120px] min-w-[120px] items-center justify-center rounded-[2rem] bg-white text-white shadow-2xl shadow-cyan-500/30 overflow-hidden">
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
            <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              GMS
            </span>
          </h1>
          <p className="mt-6 max-w-md text-lg text-slate-400 leading-relaxed tracking-wide">
            A seamless, secure, and intelligent gateway for managing your
            corporate visits and host connectivity.
          </p>
        </div>

        <div className="relative z-10 px-16 pb-12 xl:px-24">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />
            System Operations Normal
          </p>
          <p className="mt-2 text-xs text-slate-600 uppercase tracking-widest">
            &copy; {new Date().getFullYear()} Example Corp
          </p>
        </div>
      </div>

      {/* Right Pane - Registration Interface */}
      <div className="relative flex w-full flex-col items-center justify-center overflow-y-auto bg-slate-950 px-6 py-8 sm:px-12 lg:w-1/2">
        {/* Mobile-only background accents */}
        <div className="absolute top-0 right-0 h-[400px] w-[400px] rounded-full bg-cyan-600/10 blur-[100px] lg:hidden" />

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
              Guest Registration
            </h1>
            <p className="mt-2 text-slate-400">Join the enterprise portal.</p>
          </div>

          <div className="hidden lg:block mb-10">
            <h2 className="text-3xl font-semibold tracking-tight text-white">
              Guest Registration
            </h2>
            <p className="mt-2 text-slate-400">
              Create an account to track your visits.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-6">
              <Field label="Full Name" error={fieldErrors.full_name} optional>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                  <input
                    name="full_name"
                    value={formData.full_name}
                    onChange={handleChange}
                    placeholder="John Doe"
                    className="ui-input pl-11"
                  />
                </div>
              </Field>

              <Field label="Email Address" error={fieldErrors.email}>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                  <input
                    name="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="you@company.com"
                    className="ui-input pl-11"
                  />
                </div>
              </Field>

              <Field label="Phone Number" error={fieldErrors.phone} optional>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                  <input
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="+1 900 000000"
                    className="ui-input pl-11"
                  />
                </div>
              </Field>

              <div className="grid gap-6 md:grid-cols-2">
                <Field label="Password" error={fieldErrors.password}>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                    <input
                      name="password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={formData.password}
                      onChange={handleChange}
                      placeholder="Create a secure password"
                      autoComplete="new-password"
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
                </Field>

                <Field
                  label="Confirm Password"
                  error={fieldErrors.confirm_password}
                >
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                    <input
                      name="confirm_password"
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      value={formData.confirm_password}
                      onChange={handleChange}
                      placeholder="Confirm your password"
                      autoComplete="new-password"
                      className="ui-input pl-11 pr-12"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword((current) => !current)
                      }
                      className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-full p-1 text-slate-400 transition hover:text-white"
                      aria-label={
                        showConfirmPassword
                          ? "Hide confirm password"
                          : "Show confirm password"
                      }
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </Field>
              </div>

              <Field label="Company" error={fieldErrors.company} optional>
                <div className="relative">
                  <Building className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                  <input
                    name="company"
                    value={formData.company}
                    onChange={handleChange}
                    placeholder="Your Organization"
                    className="ui-input pl-11"
                  />
                </div>
              </Field>

              <div className="grid gap-6 md:grid-cols-2">
                <Field
                  label="FIDA / Passport"
                  error={fieldErrors.government_id}
                  optional
                >
                  <div className="relative">
                    <CreditCard className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                    <input
                      name="government_id"
                      value={formData.government_id}
                      onChange={handleChange}
                      placeholder="ID Number"
                      className="ui-input pl-11"
                    />
                  </div>
                </Field>

                <Field
                  label="ID Document"
                  error={fieldErrors.document_url}
                  optional
                >
                  <div className="relative">
                    <Upload className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                    <input
                      name="document_url"
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleFileChange}
                      className="ui-input pl-11 file:mr-4 file:rounded-full file:border-0 file:bg-cyan-500/10 file:px-3 file:py-1 file:text-[10px] file:font-semibold file:text-cyan-400"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-500/30 bg-cyan-500/5 py-2 text-xs font-semibold text-cyan-400 transition hover:bg-cyan-500/10"
                  >
                    <Camera className="h-4 w-4" />
                    Scan with Camera
                  </button>
                  {formData.document_url && (
                    <p className="mt-1.5 text-[10px] font-medium text-emerald-400 flex items-center gap-1">
                      <Check className="h-3 w-3" />
                      Document attached
                    </p>
                  )}
                </Field>
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
              disabled={registerMutation.isPending}
              aria-label={
                registerMutation.isPending
                  ? "Creating account..."
                  : "Create Account"
              }
              className="group relative mt-8 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-cyan-500 py-3.5 font-semibold text-slate-950 transition-all hover:bg-cyan-400 disabled:opacity-70 disabled:hover:bg-cyan-500 active:scale-[0.98]"
            >
              {registerMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <>
                  <span className="relative z-10 flex items-center gap-2">
                    Create Account
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
                Staff or Host?{" "}
                <Link
                  href="/login"
                  className="text-cyan-400 transition-colors hover:text-cyan-300 hover:underline"
                >
                  Sign in to your account
                </Link>
              </p>
            </div>
          </form>
        </div>
      </div>

      {isScannerOpen && (
        <CameraScanner
          onClose={() => setIsScannerOpen(false)}
          onCapture={handleScanCapture}
          title="Scan ID / Passport"
        />
      )}
    </main>
  );
}
