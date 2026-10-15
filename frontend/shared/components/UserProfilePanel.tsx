"use client";

import { useQuery } from "@tanstack/react-query";
import { BadgeInfo, Building2, Mail, Phone, UserRound, Shield, Key, Smartphone, Loader2, CheckCircle2 } from "lucide-react";
import { apiClient } from "@shared/lib/api-client";
import { useState } from "react";
import { useChangePassword, useToggle2fa } from "@features/auth/hooks";
import { Field } from "./ui/Field";

type UserProfile = {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  office_id?: number | null;
  department_id?: number | null;
  roles?: string[];
  two_factor_enabled?: boolean;
};

export default function UserProfilePanel() {
  const profileQuery = useQuery({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const response = await apiClient.get("/users/profile");
      return response.data.data as UserProfile;
    },
  });

  const profile = profileQuery.data;

  // Security States
  const changePassMutation = useChangePassword();
  const toggle2faMutation = useToggle2fa();

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passError, setPassError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError(null);
    setPassSuccess(false);

    if (newPassword !== confirmPassword) {
      setPassError("New passwords do not match.");
      return;
    }

    try {
      await changePassMutation.mutateAsync({ old_password: oldPassword, new_password: newPassword });
      setPassSuccess(true);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPassError(err.response?.data?.message || "Failed to update password.");
    }
  };

  const handleToggle2fa = async (enabled: boolean) => {
    try {
      await toggle2faMutation.mutateAsync(enabled);
      profileQuery.refetch();
    } catch (err: any) {
      alert("Failed to update 2FA settings.");
    }
  };

  return (
    <div className="space-y-8">
      <section className="ui-hero">
        <p className="text-xs uppercase tracking-[0.35em] text-slate-500">
          Profile
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Your account details
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
          Review the contact and office details used across dashboards and
          notifications.
        </p>
      </section>

      <section className="ui-card ui-card-elevated">
        {profileQuery.isLoading ? (
          <div className="space-y-3">
            <div className="h-6 w-40 animate-pulse rounded bg-slate-800" />
            <div className="h-20 animate-pulse rounded-2xl bg-slate-800" />
            <div className="h-20 animate-pulse rounded-2xl bg-slate-800" />
          </div>
        ) : profileQuery.isError ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            Unable to load your profile right now.
          </div>
        ) : profile ? (
          <>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-300">
                <UserRound className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <p className="text-lg font-semibold text-white">
                  {profile.full_name}
                </p>
                <p className="text-sm text-slate-400">User ID: {profile.id}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <InfoRow
                icon={Mail}
                label="Email"
                value={profile.email || "Not provided"}
              />
              <InfoRow
                icon={Phone}
                label="Phone"
                value={profile.phone || "Not provided"}
              />
              <InfoRow
                icon={Building2}
                label="Office"
                value={
                  profile.office_id != null
                    ? String(profile.office_id)
                    : "Not assigned"
                }
              />
              <InfoRow
                icon={BadgeInfo}
                label="Roles"
                value={
                  Array.isArray(profile.roles) && profile.roles.length
                    ? profile.roles.join(", ")
                    : "Not available"
                }
              />
            </div>
          </>
        ) : null}
      </section>

      <section className="ui-hero mt-12">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
            <Shield className="h-5 w-5" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Security Center</h2>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">
          Manage your authentication preferences and keep your corporate account secure.
        </p>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Change Password Card */}
        <section className="ui-card ui-card-elevated">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
              <Key className="h-4 w-4" />
            </div>
            <h3 className="text-lg font-bold text-white">Update Password</h3>
          </div>

          <form onSubmit={handlePasswordChange} className="space-y-4">
            <Field label="Current Password">
              <input
                type="password"
                required
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="••••••••"
                className="ui-input"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
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
              <Field label="Confirm New Password">
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="ui-input"
                />
              </Field>
            </div>

            {passError && (
              <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl text-center">
                {passError}
              </p>
            )}

            {passSuccess && (
              <div className="flex items-center justify-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl">
                <CheckCircle2 className="h-4 w-4" />
                Password updated successfully.
              </div>
            )}

            <button
              type="submit"
              disabled={changePassMutation.isPending}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 font-bold text-white transition-all hover:bg-indigo-400 disabled:opacity-50"
            >
              {changePassMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Secure Account"}
            </button>
          </form>
        </section>

        {/* 2FA Card */}
        <section className="ui-card ui-card-elevated flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <Smartphone className="h-4 w-4" />
              </div>
              <h3 className="text-lg font-bold text-white">Multi-Factor Authentication</h3>
            </div>
            
            <p className="text-sm text-slate-400 leading-relaxed mb-6">
              Two-factor authentication adds an extra layer of security to your account. 
              In addition to your password, you&apos;ll need to enter a secure code sent to your 
              registered email each time you log in.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-white">Email Authentication</p>
                <p className="text-xs text-slate-500 mt-1">
                  {profile?.two_factor_enabled ? "Currently protected" : "Currently disabled"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggle2fa(!profile?.two_factor_enabled)}
                disabled={toggle2faMutation.isPending}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  profile?.two_factor_enabled ? "bg-emerald-500" : "bg-slate-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    profile?.two_factor_enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: any }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-500">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-2 font-medium text-white break-words">{value}</p>
    </div>
  );
}
