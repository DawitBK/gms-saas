'use client';

import { FormEvent, useEffect, useState } from 'react';
import { BadgeInfo, BellRing, Building2, Camera, Check, FileText, Loader2, Phone, Save, Scan, ShieldCheck, UserRound } from 'lucide-react';
import { useGuestProfile, useUpdateGuestProfile } from '@features/guests/hooks';
import { CameraScanner } from '@shared/components/ui/CameraScanner';
import { useScanDocument } from '@features/ocr/hooks';
import { useResetOnChange } from '@shared/hooks/useResetOnChange';

export default function GuestProfilePage() {
  const profileQuery = useGuestProfile();
  const updateMutation = useUpdateGuestProfile();
  const profile = profileQuery.data;

  const [form, setForm] = useState({
    company: '',
    government_id: '',
    notes: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    preferred_notification_channel: 'EMAIL' as 'EMAIL' | 'SMS' | 'BOTH',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const scanMutation = useScanDocument();

  // Seed the form when the profile arrives. Adjusted during render so the
  // fields are already populated on the first paint that has data, instead of
  // rendering empty inputs and filling them a frame later.
  useResetOnChange([profile], () => {
    if (!profile) return;
    setForm({
      company: profile.company ?? '',
      government_id: profile.government_id ?? '',
      notes: profile.notes ?? '',
      emergency_contact_name: profile.emergency_contact_name ?? '',
      emergency_contact_phone: profile.emergency_contact_phone ?? '',
      preferred_notification_channel: profile.preferred_notification_channel,
    });
  });

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    try {
      await updateMutation.mutateAsync({
        company: form.company || null,
        government_id: form.government_id || null,
        notes: form.notes || null,
        emergency_contact_name: form.emergency_contact_name || null,
        emergency_contact_phone: form.emergency_contact_phone || null,
        preferred_notification_channel: form.preferred_notification_channel,
      });
      setMessage('Profile updated successfully.');
    } catch (error: any) {
      setMessage(error.response?.data?.error?.message ?? 'We could not update your profile right now.');
    }
  };

  const handleScanCapture = async (base64: string) => {
    setIsScannerOpen(false);
    setMessage(null);
    
    try {
      // 1. Instantly trigger OCR scan
      const result = await scanMutation.mutateAsync({ image: base64 });
      
      // 2. Update local form fields for direct feedback
      if (result.success && result.data.extracted) {
        const { id_number } = result.data.extracted;
        if (id_number) {
          setForm(prev => ({ ...prev, government_id: id_number }));
        }
      }

      // 3. Persist the new document and ocr text to profile
      await updateMutation.mutateAsync({
        document_url: base64,
        ocr_text: result.data.raw_text
      });
      
      setMessage('Identity document updated and verified successfully.');
    } catch (error: any) {
      console.error("Scan integration failed:", error);
      setMessage('Failed to process identity document. Please try a clearer photo.');
    }
  };

  return (
    <div className="space-y-8">
      <section className="ui-hero">
        <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Guest identity</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Keep your visit profile accurate before you arrive.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
          Update the details reception may need for verification, emergency contact, and delivery preferences.
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.7fr_1.3fr] items-start">
        <div className="space-y-4">
          <div className="ui-card ui-card-elevated">
            {profileQuery.isLoading ? (
              <div className="space-y-3">
                <div className="h-6 w-32 animate-pulse rounded bg-slate-800" />
                <div className="h-16 animate-pulse rounded-2xl bg-slate-800" />
                <div className="h-16 animate-pulse rounded-2xl bg-slate-800" />
              </div>
            ) : profileQuery.isError ? (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
                {profileQuery.error instanceof Error ? profileQuery.error.message : 'We couldn&apos;t load your guest profile.'}
              </div>
            ) : profile ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-300">
                    <UserRound className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-white">{profile.full_name}</p>
                    <p className="text-sm text-slate-400">{profile.email}</p>
                  </div>
                </div>

                <div className="mt-6 space-y-3 text-sm text-slate-300">
                  <InfoRow icon={Phone} label="Phone" value={profile.phone || 'Not provided'} />
                  <InfoRow icon={Building2} label="Company" value={profile.company || 'Independent visitor'} />
                  <InfoRow
                    icon={ShieldCheck}
                    label="Visit history"
                    value={`${profile.visits_count} recorded visit${profile.visits_count === 1 ? '' : 's'}`}
                  />
                  <InfoRow
                    icon={BellRing}
                    label="Notifications"
                    value={profile.preferred_notification_channel}
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>

        <form onSubmit={onSubmit} className="ui-card ui-card-elevated">
          <div className="grid gap-5 md:grid-cols-2 items-start">
            <FormField label="Company" icon={Building2}>
              <input
                value={form.company}
                onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))}
                className="ui-input"
                placeholder="Example Corp partner company"
              />
            </FormField>

            <FormField label="Government ID" icon={BadgeInfo}>
              <input
                value={form.government_id}
                onChange={(event) => setForm((current) => ({ ...current, government_id: event.target.value }))}
                className="ui-input"
                placeholder="Passport or national ID"
              />
            </FormField>

            <FormField label="Emergency contact name" icon={UserRound}>
              <input
                value={form.emergency_contact_name}
                onChange={(event) => setForm((current) => ({ ...current, emergency_contact_name: event.target.value }))}
                className="ui-input"
                placeholder="Trusted contact"
              />
            </FormField>

            <FormField label="Emergency contact phone" icon={Phone}>
              <input
                value={form.emergency_contact_phone}
                onChange={(event) => setForm((current) => ({ ...current, emergency_contact_phone: event.target.value }))}
                className="ui-input"
                placeholder="+1..."
              />
            </FormField>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-[0.9fr_1.1fr] items-start">
            <FormField label="Notification preference" icon={BellRing}>
              <select
                value={form.preferred_notification_channel}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    preferred_notification_channel: event.target.value as 'EMAIL' | 'SMS' | 'BOTH',
                  }))
                }
                className="ui-input"
              >
                <option value="EMAIL">Email</option>
                <option value="SMS">SMS</option>
                <option value="BOTH">Both</option>
              </select>
            </FormField>

            <FormField label="Reception notes" icon={FileText}>
              <textarea
                rows={4}
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                className="ui-input"
                placeholder="Accessibility needs, arrival notes, or check-in context."
              />
            </FormField>
          </div>

          {message ? (
            <div className={`mt-5 rounded-2xl border p-4 text-sm ${updateMutation.isError ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'}`}>
              {message}
            </div>
          ) : null}

          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={updateMutation.isPending || profileQuery.isLoading}
              className="ui-btn ui-btn-primary px-5 py-3 text-sm font-semibold disabled:opacity-60"
            >
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save profile
            </button>
          </div>
        </form>

        {/* Identity Verification Section - NEW */}
        <div className="space-y-6">
          <div className="ui-card ui-card-elevated border-cyan-500/20 bg-cyan-500/[0.02]">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Security & Identity</h3>
                <p className="text-sm text-slate-400">Identity document analysis results</p>
              </div>
            </div>

            {profile?.document_url ? (
               <div className="grid gap-6 md:grid-cols-2 items-start">
                 <div className="space-y-3">
                   <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Uploaded Document</p>
                   <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
                     <img 
                       src={profile.document_url} 
                       alt="Identity Document" 
                       className="h-full w-full object-contain p-2"
                     />
                   </div>
                 </div>
                 <div className="space-y-3">
                   <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">OCR Extracted Text</p>
                   <div className="h-full min-h-[160px] rounded-2xl border border-slate-800 bg-slate-950/50 p-4 font-mono text-xs leading-relaxed text-slate-300">
                     {profile.ocr_text || (
                       <div className="flex h-full flex-col items-center justify-center text-slate-500">
                         <Loader2 className="mb-2 h-4 w-4 animate-spin" />
                         Processing identity verification...
                       </div>
                     )}
                   </div>
                 </div>
               </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center flex flex-col items-center gap-4">
                <p className="text-sm text-slate-500">No identity document uploaded for this account.</p>
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="ui-btn ui-btn-primary px-6 py-2.5 text-xs font-semibold"
                >
                  <Camera className="h-4 w-4" />
                  Upload & Scan ID
                </button>
              </div>
            )}

            {profile?.document_url && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/50 px-4 py-2 text-xs font-medium text-slate-400 transition hover:border-cyan-500/50 hover:text-cyan-400"
                >
                  <Scan className="h-4 w-4" />
                  Scan New Document
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {isScannerOpen && (
        <CameraScanner 
          onClose={() => setIsScannerOpen(false)}
          onCapture={handleScanCapture}
          title="Identity Verification"
        />
      )}
    </div>
  );
}

function FormField({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      {children}
    </label>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-500">
        <Icon className="h-4 w-4" />
        {label}
      </p>
      <p className="mt-2 font-medium text-white">{value}</p>
    </div>
  );
}
