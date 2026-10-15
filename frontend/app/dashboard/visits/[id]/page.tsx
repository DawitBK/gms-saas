'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  Clock3,
  KeyRound,
  Loader2,
  MapPin,
  QrCode,
  ShieldCheck,
  UserRoundCog,
  XCircle,
  X,
} from 'lucide-react';
import dynamic from "next/dynamic";

const MapViewer = dynamic(() => import("@shared/components/MapViewer"), { ssr: false });
// Only rendered inside the credential/QR panel below, not on first paint —
// loading it eagerly pulled the whole qrcode.react library into every
// visit-detail page load regardless of whether that panel is ever opened.
// qrcode.react 4 removed the default export this used to resolve to. That
// default was a thin wrapper that picked a renderer from a `renderAs` prop and
// fell back to canvas — and no call site here passes `renderAs`, so naming
// QRCodeCanvas explicitly renders exactly what it rendered before.
const QRCode = dynamic(() => import("qrcode.react").then((m) => m.QRCodeCanvas), { ssr: false });
import { clsx } from 'clsx';
import { toast } from 'sonner';
import { useGuestDecision, useVisitById, useSubmitFeedback } from '@features/visits/hooks';
import { useVisitCredentials } from '@features/credentials/hooks';
import { Star } from 'lucide-react';
import { resolveVisitScanUrl } from '@shared/lib/qr-links';
import { VisitChatPanel } from '@features/messages/VisitChatPanel';
import { ApprovalHistoryPanel } from '@features/approvals/ApprovalHistoryPanel';
import { apiClient } from '@shared/lib/api-client';
import { formatDateTime } from '@shared/lib/datetime';
import type { Visit } from '@features/visits/types';

export default function VisitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const visitId = Number(params.id);

  const { data: visitResponse, isLoading, isError } = useVisitById(visitId);
  const visit = visitResponse?.data as Visit | undefined;

  const credentialsQuery = useVisitCredentials(visitId);
  const decisionMutation = useGuestDecision();

  const credentials = credentialsQuery.data ?? [];
  const activeCredential = credentials.find((c) => c.status === 'ACTIVE') ?? credentials[0] ?? null;

  const qrCodeValue = String(activeCredential?.metadata?.qr_code ?? visit?.qr_code ?? activeCredential?.id ?? '');
  const fallbackMessage =
    activeCredential?.fallback_issued
      ? activeCredential.fallback_message ?? 'UniFi was unreachable, so the system issued an internal QR and PIN for this visit.'
      : null;
  const qrImageSrc =
    typeof activeCredential?.metadata?.unifi_qr_image_data_uri === 'string'
      ? activeCredential.metadata.unifi_qr_image_data_uri
      : '';
  // Derived, not state. resolveVisitScanUrl is a pure function of these two
  // values, so mirroring its result into state through an effect only added a
  // render — and rendered the QR panel once with an empty URL first.
  const qrScanUrl = resolveVisitScanUrl(qrCodeValue, activeCredential?.metadata?.qr_url);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const feedbackMutation = useSubmitFeedback();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);



  const downloadQr = async () => {
    if (!visitId) return;
    setIsDownloading(true);
    try {
      const response = await apiClient.get(`/visits/${visitId}/qr.png`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'image/png' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `visit-${visitId}-qr.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download QR from API:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDecision = async (decision: 'ACCEPTED' | 'DECLINED') => {
    try {
      await decisionMutation.mutateAsync({ id: visitId, decision });
      toast.success(decision === 'ACCEPTED' ? 'Reschedule accepted.' : 'Reschedule declined. Escalating to reception.');
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message ?? 'Could not submit your decision.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (isError || !visit) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 text-center text-rose-200">
        We could not load this visit. It may have been deleted or you do not have permission to view it.
      </div>
    );
  }

  const isRescheduled = visit.status === 'RESCHEDULED' && visit.guest_decision?.status === 'PENDING_GUEST';
  const chatClosed = ['DECLINED', 'CANCELLED', 'EXPIRED', 'NO_SHOW'].includes(visit.status);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-12">
      <Link
        href="/dashboard/visits"
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 transition hover:text-cyan-400"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to omni-tracker
      </Link>

      <section className="ui-hero">
        <div className="flex items-center gap-4">
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-400">Visit Detail</p>
          <StatusBadge value={visit.status} />
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {visit.reference_number || `Visit #${visit.id}`} Details
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
          View approval history, credential status, and presentation passes.
        </p>
      </section>

      {/* Guest Decision Banner */}
      {isRescheduled ? (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-amber-100">Host Rescheduled Request</h3>
              <p className="mt-1 text-sm text-amber-200/80">
                Your host has changed the arrival time to {formatDateTime(visit.scheduled_start)}. Do you accept this new time?
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <button
                onClick={() => handleDecision('DECLINED')}
                disabled={decisionMutation.isPending}
                className="ui-btn rounded-xl border border-rose-500/30 px-4 py-2 text-sm text-rose-200 hover:bg-rose-500/10"
              >
                Decline
              </button>
              <button
                onClick={() => handleDecision('ACCEPTED')}
                disabled={decisionMutation.isPending}
                className="ui-btn rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
              >
                {decisionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Accept New Time'}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {/* Feedback Section for Completed Visits */}
      {visit.status === 'COMPLETED' && !visit.rating && !feedbackSubmitted && (
        <section className="ui-card ui-card-elevated border-cyan-500/30 bg-cyan-500/5 animate-in slide-in-from-top-2">
          <div className="flex flex-col gap-6 md:flex-row md:items-center">
            <div className="flex-1">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Star className="h-5 w-5 text-amber-400 fill-amber-400" /> 
                How was your visit?
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Your feedback helps us improve our guest experience. Please rate your overall experience with {visit.host?.name || "your host"}.
              </p>
            </div>
            
            <div className="flex flex-col gap-4 min-w-[300px]">
              <div className="flex items-center gap-2 justify-center md:justify-start">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onMouseEnter={() => setRating(star)}
                    onClick={() => setRating(star)}
                    className="p-1 transition-transform hover:scale-110"
                  >
                    <Star 
                      className={clsx(
                        "h-8 w-8 transition-colors",
                        star <= rating ? "text-amber-400 fill-amber-400" : "text-slate-700"
                      )} 
                    />
                  </button>
                ))}
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share more details (optional)"
                className="ui-input h-20 resize-none text-xs py-2 px-3"
              />
              <button
                onClick={() => {
                  if (rating === 0) {
                    toast.error("Please select a rating.");
                    return;
                  }
                  feedbackMutation.mutate({ id: visitId, rating, comment }, {
                    onSuccess: () => {
                      toast.success("Thank you for your feedback!");
                      setFeedbackSubmitted(true);
                    },
                    onError: () => {
                      toast.error("Failed to submit feedback.");
                    }
                  });
                }}
                disabled={feedbackMutation.isPending}
                className="ui-btn ui-btn-primary py-2 text-xs font-bold uppercase tracking-widest disabled:opacity-50"
              >
                {feedbackMutation.isPending ? "Submitting..." : "Submit Feedback"}
              </button>
            </div>
          </div>
        </section>
      )}

      {(visit.rating || feedbackSubmitted) && (
        <section className="ui-card bg-slate-900/40 border-slate-800 p-6 flex items-center gap-4 animate-in fade-in">
          <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
             <BadgeCheck className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-white">Feedback Received</h3>
            <p className="text-sm text-slate-500 mt-1">Thank you for helping us maintain high service standards.</p>
          </div>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr] items-start">
        <div className="space-y-6">
          <section className="ui-card ui-card-elevated">
            <h2 className="mb-4 text-lg font-semibold text-white">Visit Overview</h2>
            <div className="grid gap-4 sm:grid-cols-2 items-start">
              <InfoBlock label="Assigned host" value={visit.host?.name ?? 'Host not assigned'} secondary={visit.host?.email ?? ''} />
              <InfoBlock label="Guest" value={visit.guest?.name ?? 'Unknown'} secondary={visit.guest?.email ?? ''} />
              <InfoBlock label="Service" value={visit.service?.name ?? 'Unknown'} secondary={visit.department?.name ?? ''} />
              <div className="flex items-start justify-between gap-2 border-b border-slate-800/60 pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500 font-semibold">Office</p>
                  <p className="mt-0.5 truncate font-medium text-white">{visit.office?.name ?? 'Unknown'}</p>
                  {visit.office?.city && <p className="mt-0.5 truncate text-xs text-slate-400">{visit.office.city}</p>}
                </div>
                {visit.office?.latitude !== undefined && visit.office?.longitude !== undefined && (
                  <button
                    type="button"
                    onClick={() => setShowMap(true)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition"
                    title="View Location on Map"
                  >
                    <MapPin className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="col-span-full rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
                <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-500">
                  <CalendarClock className="h-4 w-4" /> Scheduled timeframe
                </p>
                <p className="mt-2 font-medium text-white">{formatDateTime(visit.scheduled_start)} - {formatDateTime(visit.scheduled_end)}</p>
                {visit.purpose && <p className="mt-2 text-sm text-slate-400">Purpose: {visit.purpose}</p>}
              </div>
            </div>
          </section>

          {/* Renders itself away when there are no decisions to show, or when
              this viewer is not entitled to read them. */}
          <ApprovalHistoryPanel visitId={visit.id} />

          <section className="ui-card ui-card-elevated">
            <h2 className="mb-4 text-lg font-semibold text-white">Messages & Updates</h2>
            <VisitChatPanel visitId={visit.id} canPost={!chatClosed} />
          </section>
        </div>

        <div className="space-y-6">
          <section className="ui-card ui-card-elevated">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Issued credential</h2>
                <p className="mt-2 text-sm text-slate-400">Present the QR code at arrival or give reception the backup PIN.</p>
              </div>
              <QrCode className="h-5 w-5 text-cyan-400" />
            </div>

            {credentialsQuery.isLoading ? (
              <div className="mt-6 flex h-[28rem] items-center justify-center rounded-3xl bg-slate-950/60">
                <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
              </div>
            ) : credentialsQuery.isError ? (
              <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
                We couldn&apos;t load the credential for this visit.
              </div>
            ) : activeCredential ? (
              <div className="mt-6 space-y-5">
                <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-sm text-emerald-300">
                    <BadgeCheck className="h-4 w-4" />
                    {activeCredential.status}
                  </div>
                  {fallbackMessage ? (
                    <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                      <p className="font-medium text-amber-50">System credential issued</p>
                      <p className="mt-1 text-amber-100/90">{fallbackMessage}</p>
                    </div>
                  ) : null}
                  <div className="mt-6 flex justify-center">
                    <div id="qr-container" className="inline-flex rounded-[2rem] bg-white p-5">
                      {qrImageSrc ? (
                        <Image src={qrImageSrc} alt="Visit QR code" width={220} height={220} unoptimized className="rounded-xl" />
                      ) : (
                        <QRCode value={qrScanUrl || qrCodeValue} size={220} />
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={downloadQr}
                      disabled={isDownloading}
                      className="ui-btn ui-btn-secondary text-xs font-semibold hover:border-cyan-500/40 hover:text-cyan-200"
                    >
                      {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                      Download QR (PNG)
                    </button>
                  </div>
                  {qrScanUrl && !qrScanUrl.startsWith('data:') ? (
                    <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-300 text-center">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Raw QR token</p>
                      <p className="mt-2 block break-all font-medium text-cyan-300">
                        {qrScanUrl}
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <InfoCard
                    icon={Clock3}
                    label="Access window"
                    value={`${formatDateTime(activeCredential.valid_from)} to ${formatDateTime(activeCredential.valid_until)}`}
                  />
                  <InfoCard icon={KeyRound} label="Backup PIN" value={String(activeCredential.metadata?.pin_code ?? 'Not available')} />
                  <InfoCard
                    icon={ShieldCheck}
                    label="Credential mode"
                    value={activeCredential.fallback_issued ? 'System fallback active' : activeCredential.provider}
                  />
                  <InfoCard
                    icon={ShieldCheck}
                    label="Assigned doors"
                    value={activeCredential.door_ids.length ? activeCredential.door_ids.join(', ') : 'Assigned automatically'}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-100">
                No credential has been issued for this visit yet. Once approval completes, your QR and backup PIN will appear here.
              </div>
            )}
          </section>

          {visit.status === 'APPROVED' || visit.status === 'CHECKED_IN' ? (
            <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-300">
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <AlertTriangle className="h-4 w-4 text-amber-300" /> Arrival note
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                {visit.reference_number || `Visit #${visit.id}`} is scheduled for {formatDateTime(visit.scheduled_start)}. If the QR does not scan, provide the backup PIN and a valid ID to reception for manual verification.
              </p>
            </section>
          ) : null}
        </div>
      </div>

      {showMap && visit.office?.latitude !== undefined && visit.office?.longitude !== undefined && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <MapPin className="h-5 w-5 text-cyan-400" />
                Location: {visit.office.name}
              </h3>
              <button 
                onClick={() => setShowMap(false)}
                className="p-2 -mr-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 bg-slate-950">
              <MapViewer 
                latitude={Number(visit.office.latitude)} 
                longitude={Number(visit.office.longitude)} 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function readableStatus(value: Visit['status']) {
  return value === 'APPROVED' ? 'Confirmed' : value === 'CHECKED_IN' ? 'Checked in' : value === 'IN_PROGRESS' ? 'In progress' : value === 'RESCHEDULED' ? 'Rescheduled' : value.charAt(0) + value.slice(1).toLowerCase();
}

function StatusBadge({ value }: { value: Visit['status'] }) {
  const tone =
    value === 'APPROVED' || value === 'CHECKED_IN' || value === 'COMPLETED' || value === 'IN_PROGRESS'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : value === 'DECLINED' || value === 'CANCELLED'
        ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
        : value === 'PENDING'
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
          : 'border-slate-700 bg-slate-900 text-slate-300';
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em] ${tone}`}>
      {value === 'DECLINED' || value === 'CANCELLED' ? <XCircle className="h-3.5 w-3.5" /> : <UserRoundCog className="h-3.5 w-3.5" />}
      {readableStatus(value)}
    </span>
  );
}

function InfoBlock({ label, value, secondary }: { label: string; value: string; secondary: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 break-words font-medium text-white">{value}</p>
      <p className="mt-1 break-words text-sm text-slate-400">{secondary}</p>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm">
      <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-500">
        <Icon className="h-4 w-4" /> {label}
      </p>
      <p className="mt-2 font-medium text-white">{value}</p>
    </div>
  );
}
