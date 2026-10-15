"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  ShieldPlus,
  UserPlus,
  Camera,
  Check,
  Scan,
  Upload,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { CameraScanner } from "@shared/components/ui/CameraScanner";
import { BulkUploadModal } from "@features/guests/components/BulkUploadModal";
import { BulkOrgUploadModal } from "./BulkOrgUploadModal";
import { useScanDocument } from "@features/ocr/hooks";
import { useCreateAdminUser } from "./hooks";
import type { CreatedAdminUserCredentials } from "./types";
import { useDepartments, useOffices } from "@features/catalog/hooks";
import {
  useManagedServicesList,
} from "@features/management/hooks";
import { Field } from "@shared/components/ui/Field";
import { useRoleContext } from "@shared/hooks/useRoleContext";
import { useAuthStore } from "@state/auth.store";
import {
  canAssignSuperRoles,
  getRoleDescription,
  getRoleLabel,
  getRoleScopeLabel,
  requiresDepartmentAssignment,
  requiresOfficeAssignment,
} from "@shared/lib/roles";

export default function CreateUserForm() {
  const createUser = useCreateAdminUser();
  const officesQuery = useOffices();
  const { activeRole } = useRoleContext();
  const actorOfficeId = useAuthStore((state) => state.officeId);
  const allowSuperRoleAssignment = canAssignSuperRoles(activeRole);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    password: "",
    role: "admin",
    office_id:
      !allowSuperRoleAssignment && actorOfficeId ? String(actorOfficeId) : "",
    department_id: "",
    company: "",
    government_id: "",
    document_url: "",
    service_id: "",
  });
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const scanMutation = useScanDocument();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [lastCreatedUser, setLastCreatedUser] =
    useState<CreatedAdminUserCredentials | null>(null);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [isOrgUploadOpen, setIsOrgUploadOpen] = useState(false);

  const roleOptions = useMemo(
    () =>
      [
        "admin",
        "reception",
        "host",
        "guest",
        ...(allowSuperRoleAssignment
          ? ["super_admin", "super_reception", "super_host"]
          : []),
      ] as const,
    [allowSuperRoleAssignment],
  );
  const selectedOfficeId = form.office_id ? Number(form.office_id) : undefined;
  const departmentsQuery = useDepartments(selectedOfficeId);
  const needsOfficeAssignment = requiresOfficeAssignment(form.role);
  const needsDepartmentAssignment = requiresDepartmentAssignment(form.role);
  const isHostProvisioning = form.role === "host";
  const servicesQuery = useManagedServicesList(selectedOfficeId, false);
  const officeOptions = useMemo(
    () => officesQuery.data ?? [],
    [officesQuery.data],
  );
  const departmentOptions = useMemo(
    () => departmentsQuery.data ?? [],
    [departmentsQuery.data],
  );
  const officeSelectionLocked =
    !allowSuperRoleAssignment && needsOfficeAssignment && Boolean(actorOfficeId);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setForm((previous) => ({
      ...previous,
      [event.target.name]: event.target.value,
    }));
  };

  const roles = useAuthStore((state) => state.roles);
  const isSuperAdminUser = roles.includes("super_admin");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSuccess(false);

    try {
      const roles = form.role ? [form.role] : [];
      const createdCredentials = {
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        roles,
        office_id: form.office_id ? Number(form.office_id) : null,
        department_id: form.department_id ? Number(form.department_id) : null,
        service_ids: form.service_id ? [Number(form.service_id)] : [],
      };

      await createUser.mutateAsync({
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        roles,
        office_id: form.office_id ? Number(form.office_id) : undefined,
        department_id: form.department_id ? Number(form.department_id) : undefined,
        service_ids: form.service_id ? [Number(form.service_id)] : [],
        replace_service_assignments: true,
        company: form.company,
        government_id: form.government_id,
        document_url: form.document_url,
      });

      setSuccess(true);
      setLastCreatedUser(createdCredentials);
      setForm({
        full_name: "",
        email: "",
        phone: "",
        password: "",
        role: "admin",
        office_id:
          !allowSuperRoleAssignment && actorOfficeId
            ? String(actorOfficeId)
            : "",
        department_id: "",
        company: "",
        government_id: "",
        document_url: "",
        service_id: "",
      });
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
          "Failed to create user",
      );
    }
  };

  const handleScanCapture = async (base64: string) => {
    setIsScannerOpen(false);
    setForm((prev) => ({ ...prev, document_url: base64 }));

    try {
      const result = await scanMutation.mutateAsync({ image: base64 });
      if (result.success && result.data.extracted) {
        const { full_name, id_number } = result.data.extracted;
        setForm((prev) => ({
          ...prev,
          full_name: full_name || prev.full_name,
          government_id: id_number || prev.government_id,
        }));
      }
    } catch (err) {
      console.error("OCR Scan failed in admin form:", err);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="ui-card ui-card-elevated">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-300">
          <ShieldPlus className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">
            Create staff account
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            Provision a new internal user with the exact role they need in one
            safe step.
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => setIsBulkUploadOpen(true)}
            className="flex items-center gap-2 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-indigo-300 transition hover:bg-indigo-500/20 active:scale-[0.98]"
          >
            <Upload className="h-4 w-4" />
            Bulk Import
          </button>
          {(allowSuperRoleAssignment || isSuperAdminUser) && (
            <button
              type="button"
              onClick={() => setIsOrgUploadOpen(true)}
              className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-emerald-300 transition hover:bg-emerald-500/20 active:scale-[0.98]"
            >
              <Sparkles className="h-4 w-4" />
              Seed System
            </button>
          )}
        </div>
      </div>

      <BulkUploadModal 
        isOpen={isBulkUploadOpen}
        onClose={() => setIsBulkUploadOpen(false)}
        onSuccess={() => {
          // You might want to refresh lists here if needed
        }}
      />
      <BulkOrgUploadModal 
        isOpen={isOrgUploadOpen}
        onClose={() => setIsOrgUploadOpen(false)}
      />

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Field label="Full name" error={fieldErrors.full_name}>
          <input
            name="full_name"
            value={form.full_name}
            onChange={handleChange}
            placeholder="Full Name"
            className="ui-input"
            // required
          />
        </Field>
        <Field label="Email" error={fieldErrors.email}>
          <input
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="Email"
            type="email"
            className="ui-input"
            // required
          />
        </Field>
        <Field label="Phone" error={fieldErrors.phone}>
          <input
            name="phone"
            value={form.phone}
            onChange={handleChange}
            placeholder="+1..."
            className="ui-input"
          />
        </Field>
        <Field label="Password" error={fieldErrors.password}>
          <div className="relative">
            <input
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Password"
              type={showPassword ? "text" : "password"}
              className="ui-input pr-12"
              // required
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-full p-1 text-slate-400 transition hover:text-slate-100"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Role" error={fieldErrors.roles}>
          <select
            name="role"
            value={form.role}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                role: event.target.value,
                office_id:
                  requiresOfficeAssignment(event.target.value)
                    ? officeSelectionLocked && actorOfficeId
                      ? String(actorOfficeId)
                      : previous.office_id
                    : "",
                department_id:
                  requiresDepartmentAssignment(event.target.value)
                    ? previous.department_id
                    : "",
                service_id:
                  event.target.value === "host" ? previous.service_id : "",
              }))
            }
            className="ui-input"
            required
          >
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {getRoleLabel(role)}
              </option>
            ))}
          </select>
        </Field>
        <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">
              {getRoleScopeLabel(form.role)}
            </span>
            <span className="font-semibold text-white">{getRoleLabel(form.role)}</span>
          </div>
          <p className="mt-2 text-sm text-slate-400">{getRoleDescription(form.role)}</p>
        </div>
      </div>

      {!allowSuperRoleAssignment ? (
        <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-slate-300">
          Office admins can provision office-scoped staff only. Super roles are
          reserved for super administrators.
        </div>
      ) : null}

      {needsOfficeAssignment ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Office" error={fieldErrors.office_id}>
            <select
              name="office_id"
              value={form.office_id}
              onChange={handleChange}
              className="ui-input"
              disabled={officesQuery.isLoading || officeSelectionLocked}
            >
              <option value="">Select office (optional)</option>
              {officeOptions.map((office) => (
                <option key={office.id} value={office.id}>
                  {office.name}
                </option>
              ))}
            </select>
          </Field>

          {needsDepartmentAssignment ? (
            <Field label="Department" error={fieldErrors.department_id}>
              <select
                name="department_id"
                value={form.department_id}
                onChange={handleChange}
                className="ui-input"
                disabled={!form.office_id || departmentsQuery.isLoading}
              >
                <option value="">Select department (optional)</option>
                {departmentOptions.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-slate-300">
              {form.role === "admin"
                ? "Office admins are bound to the selected office for user, host, and schedule management."
                : "Reception users are bound to the selected office for dashboards, queues, and approvals."}
            </div>
          )}
        </div>
      ) : null}

      {needsOfficeAssignment ? (
        <div className="mt-4">
          <Field
            label="Service (Optional)"
            error={fieldErrors.service_id}
            optional
          >
            <select
              name="service_id"
              value={form.service_id}
              onChange={handleChange}
              className="ui-input"
              disabled={!form.office_id || servicesQuery.isLoading || !isHostProvisioning}
            >
              <option value="">
                {isHostProvisioning
                  ? "Select service (optional)"
                  : "Service assignment is for hosts"}
              </option>
              {(servicesQuery.data?.services ?? []).map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </Field>
          <p className="mt-2 text-xs text-slate-500">
            Optional. Host-to-service links are saved directly with the account now.
          </p>
        </div>
      ) : null}

      {/* Guest Specific Identity Fields (Optional for all for testing) */}
      <div className="mt-6 border-t border-slate-800 pt-6">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 mb-4">Identity & Organization</h4>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Company" error={fieldErrors.company}>
            <input
              name="company"
              value={form.company}
              onChange={handleChange}
              placeholder="Guest Company"
              className="ui-input"
            />
          </Field>
          <Field label="Government ID / Passport" error={fieldErrors.government_id}>
            <input
              name="government_id"
              value={form.government_id}
              onChange={handleChange}
              placeholder="ID Number"
              className="ui-input"
            />
          </Field>
        </div>
        
        <div className="mt-4">
          <label className="text-xs font-medium text-slate-400 mb-2 block">Identity Document</label>
          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-500/30 bg-cyan-500/5 py-4 text-sm font-semibold text-cyan-400 transition hover:bg-cyan-500/10 active:scale-[0.99]"
          >
            <Camera className="h-5 w-5" />
            Capture & Scan Identity
          </button>
          {form.document_url && (
            <p className="mt-2 text-xs font-medium text-emerald-400 flex items-center gap-2">
              <Check className="h-4 w-4" />
              Document captured successfully
            </p>
          )}
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          <CheckCircle2 className="h-4 w-4" />
          User created successfully.
        </p>
      ) : null}
      {lastCreatedUser ? (
        <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-slate-200">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-white">
                Latest account credentials
              </p>
              <p className="mt-1 text-xs text-slate-400">
                This shows the password you just entered. Stored passwords are
                not readable from the system after save.
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(
                  `Email: ${lastCreatedUser.email}\nPassword: ${lastCreatedUser.password}\nRoles: ${lastCreatedUser.roles.join(", ")}`,
                );
              }}
              className="ui-btn px-3 py-2 text-xs font-semibold border-cyan-500/30 text-cyan-100 hover:bg-cyan-500/10"
            >
              <Copy className="h-4 w-4" />
              Copy credentials
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <CredentialField label="Name" value={lastCreatedUser.full_name} />
            <CredentialField label="Email" value={lastCreatedUser.email} />
            <CredentialField
              label="Phone"
              value={lastCreatedUser.phone || "No phone provided"}
            />
            <CredentialField
              label="Roles"
              value={lastCreatedUser.roles.map((role) => getRoleLabel(role)).join(", ")}
            />
            <CredentialField
              label="Password"
              value={lastCreatedUser.password}
              secret
            />
          </div>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={createUser.isPending}
        className="ui-btn ui-btn-primary mt-6 px-5 py-3 text-sm font-semibold"
      >
        {createUser.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <UserPlus className="h-4 w-4" />
        )}
        Create account
      </button>

      {isScannerOpen && (
        <CameraScanner 
          onClose={() => setIsScannerOpen(false)}
          onCapture={handleScanCapture}
          title="Onboard Identity"
        />
      )}

      <BulkUploadModal 
        isOpen={isBulkUploadOpen}
        onClose={() => setIsBulkUploadOpen(false)}
        onSuccess={() => {
          // You might want to refresh lists here if needed
        }}
      />
    </form>
  );
}

function CredentialField({
  label,
  value,
  secret = false,
}: {
  label: string;
  value: string;
  secret?: boolean;
}) {
  const [revealed, setRevealed] = useState(!secret);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
        {label}
      </p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="break-all text-sm text-white">
          {secret && !revealed ? "********" : value}
        </p>
        {secret ? (
          <button
            type="button"
            onClick={() => setRevealed((current) => !current)}
            className="inline-flex items-center rounded-full p-1 text-slate-400 transition hover:text-slate-100"
            aria-label={
              revealed ? "Hide credential field" : "Show credential field"
            }
          >
            {revealed ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}
