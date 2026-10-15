'use client';

import { useEffect, useMemo, useState } from 'react';
import { useCheckInVisit, useVisitsList } from '@features/visits/hooks';
import { QrCode, Loader2, CheckCircle2, XCircle, Clock3, ShieldCheck, Camera } from 'lucide-react';
import dynamic from 'next/dynamic';
import PaginationControls from '@shared/components/PaginationControls';

// Opens the device camera (getUserMedia) — loaded on demand rather than
// bundled into every page load of this checkin screen, since the scanner is
// only ever conditionally mounted after the user clicks "Scan".
const CameraScanner = dynamic(
  () => import('@shared/components/ui/CameraScanner').then((mod) => mod.CameraScanner),
  { ssr: false },
);
import { useScanDocument } from '@features/ocr/hooks';
import { formatDateTime } from '@shared/lib/datetime';
import clsx from 'clsx';
import { toast } from 'sonner';
import { useOfficeRealtime } from '@shared/hooks/useOfficeRealtime';
import { useResetOnChange } from '@shared/hooks/useResetOnChange';
import { useQueryParam } from '@shared/hooks/useQueryParam';

export default function CheckinPage() {
  const [qrCode, setQrCode] = useState('');
  // Seeded from ?qr= once it is readable. Unlike the pages above, this one is
  // a real editable field (typed into, cleared after a check-in, and set by
  // clicking a visit), so the URL only provides its initial value. useQueryParam
  // returns null during SSR and the real value on the first client render,
  // which is the change this picks up.
  const qrParam = useQueryParam('qr');
  useResetOnChange([qrParam], () => {
    if (qrParam) setQrCode(qrParam);
  });
  const [manualOverride, setManualOverride] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [page, setPage] = useState(1);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [verificationState, setVerificationState] = useState<{
    method: 'QR' | 'ID_SCAN' | 'MANUAL';
    verified: boolean;
    notes?: string;
  } | null>(null);
  const scanMutation = useScanDocument();
  const limit = 5;

  const { mutate, isPending } = useCheckInVisit();
  const approvedVisitsQuery = useVisitsList({ page, limit, status: 'APPROVED' });
  const recentApproved = useMemo(() => approvedVisitsQuery.data?.data ?? [], [approvedVisitsQuery.data]);
  const hasNextPage = page < (approvedVisitsQuery.data?.meta?.totalPages ?? 1);
  const officeIds = useMemo(
    () => recentApproved.map((visit) => visit.office?.id ?? visit.service?.office_id ?? visit.department?.office_id ?? null),
    [recentApproved]
  );

  useOfficeRealtime(officeIds);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleCheckIn = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    if (!qrCode.trim()) {
      setErrorMessage('Please enter a valid QR code.');
      return;
    }

    mutate({ 
      qrCode, 
      manualOverride,
      verificationMetadata: verificationState ?? (manualOverride ? { method: 'MANUAL', verified: true } : { method: 'QR', verified: true })
    }, {
      onSuccess: (res) => {
        if (manualOverride) {
          setSuccessMessage(`Manual override checked in ${res.data.guest?.name || '#' + res.data.id}.`);
          toast.success(`Manual override checked in ${res.data.guest?.name || (res.data.reference_number || `visit #${res.data.id}`)}.`);
        } else {
          setSuccessMessage(
            `QR verified for ${res.data.guest?.name || '#' + res.data.id}. Waiting for UniFi Access verification to mark the visit as checked in.`
          );
          toast(`QR verified for ${res.data.guest?.name || (res.data.reference_number || `visit #${res.data.id}`)}. Waiting for UniFi Access confirmation.`);
        }
        setQrCode('');
        setVerificationState(null);
      },
      onError: (err: any) => {
        setErrorMessage(
          err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Failed to check in. Please verify the QR credential and try again.'
        );
      },
    });
  };

  const handleScanCapture = async (base64: string) => {
    setIsScannerOpen(false);
    
    // Find the current visit name if QR code is populated
    const currentVisit = recentApproved.find(v => v.qr_code === qrCode);
    const expectedName = currentVisit?.guest?.name;

    toast.promise(scanMutation.mutateAsync({ image: base64, expectedName }), {
      loading: 'Analyzing identity document...',
      success: (result) => {
        if (result.success && result.data) {
          const { extracted, watchlist, verification } = result.data;
          
          if (watchlist.alerted) {
            toast.error(`WATCHLIST ALERT: ${watchlist.reason}`, { duration: 10000 });
            setErrorMessage(`SECURITY ALERT: ${watchlist.reason}. Contact management immediately.`);
          }

          if (expectedName && !verification.matched) {
            toast.error("IDENTITY MISMATCH: Scanned ID does not match the expected guest name.", { duration: 6000 });
          } else if (expectedName && verification.matched) {
            toast.success("Identity Verified: ID matches the expected guest.");
          }

          setVerificationState({
            method: 'ID_SCAN',
            verified: verification.matched,
            notes: watchlist.alerted ? `Watchlist alert: ${watchlist.reason}` : undefined
          });

          return `Scan complete: ${extracted.full_name || 'Identity recognized'}`;
        }
        return 'Scan complete.';
      },
      error: 'Identity scan failed.'
    });
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <section className="ui-hero mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-100">Check-in console</h1>
        <p className="mt-2 text-slate-400">
          Verify a QR credential for the primary UniFi-driven arrival flow, or use a manual override when privileged staff need to force check-in.
        </p>
      </section>

      {isOffline && (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center gap-3">
          <Clock3 className="h-5 w-5 text-amber-400" />
          <p className="text-sm text-amber-200">
            <strong>Console Offline:</strong> Connectivity to the GMS server is lost. You can still verify physical documents manually, but digital check-ins will be queued until the system is back online.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] items-start">
        <div className="ui-card ui-card-elevated">
          <form onSubmit={handleCheckIn} className="flex flex-col gap-4 p-6">
            <label htmlFor="qrCode" className="text-sm font-medium text-slate-300">
              QR Code
            </label>
            <div className="relative">
              <QrCode className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
              <input
                id="qrCode"
                type="text"
                value={qrCode}
                onChange={(e) => setQrCode(e.target.value)}
                disabled={isPending}
                placeholder="Paste the visitor QR link or token"
                className={clsx('ui-input py-3 pl-10', 'disabled:opacity-50')}
              />
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={manualOverride}
                onChange={(event) => setManualOverride(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-900 text-amber-400"
              />
              <span>
                <span className="block font-medium text-amber-200">Manual override</span>
                <span className="mt-1 block text-slate-400">
                  Leave this off for the primary UniFi-first flow. Turn it on only when host, reception, or admin staff must force `CHECKED_IN` without the UniFi confirmation event.
                </span>
              </span>
            </label>

            <button
              type="submit"
              disabled={isPending || !qrCode.trim()}
              className="ui-btn ui-btn-primary mt-2 w-full rounded-2xl py-3 font-semibold disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Processing...
                </>
              ) : (
                manualOverride ? 'Force Manual Check-In' : 'Verify QR'
              )}
            </button>

            <div className="mt-2 border-t border-slate-800 pt-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Identity Verification</p>
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-500/30 bg-cyan-500/5 py-4 text-sm font-semibold text-cyan-400 transition hover:bg-cyan-500/10 active:scale-[0.99]"
              >
                <Camera className="h-5 w-5" />
                Scan Guest ID
              </button>
            </div>
          </form>

          {(successMessage || errorMessage) && (
            <div className="border-t border-slate-800 p-6" role="status" aria-live="polite">
              {successMessage && (
                <div className="flex items-center gap-3 rounded-lg bg-emerald-500/10 p-4 font-medium text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                  {successMessage}
                </div>
              )}
              {errorMessage && (
                <div className="flex items-center gap-3 rounded-lg bg-red-500/10 p-4 font-medium text-red-400">
                  <XCircle className="h-5 w-5 shrink-0" />
                  {errorMessage}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="ui-card ui-card-elevated">
          <div className="border-b border-slate-800 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Ready arrivals</h2>
                <p className="mt-2 text-sm text-slate-400">Approved visits currently visible in your office queue.</p>
              </div>
              <ShieldCheck className="h-5 w-5 text-cyan-400" />
            </div>
          </div>

          <div className="p-6">
            {approvedVisitsQuery.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-20 animate-pulse rounded-2xl bg-slate-800/70" />
                ))}
              </div>
            ) : approvedVisitsQuery.isError ? (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
                We couldn&apos;t load the approved arrival queue.
              </div>
            ) : recentApproved.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-400">
                No approved arrivals are waiting right now.
              </div>
            ) : (
              <div className="space-y-3">
                {recentApproved.map((visit) => (
                  <button
                    key={visit.id}
                    type="button"
                    data-testid={`ready-arrival-${visit.id}`}
                    onClick={() => setQrCode(visit.qr_code)}
                    className="block w-full rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-left transition hover:border-slate-700"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-white">{visit.guest?.name ?? (visit.reference_number || `Visit #${visit.id}`)}</p>
                        <p className="mt-1 text-sm text-slate-400">{formatDateTime(visit.scheduled_start)}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          Assigned host: {visit.host?.name ?? 'Host not assigned yet'}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-300">
                        <Clock3 className="h-3.5 w-3.5" />
                        {visit.latest_credential?.status ?? 'Awaiting credential'}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-sm text-slate-400">Tap to populate the QR token for UniFi-first verification or paste a full scan link from a phone camera.</p>
                      {visit.latest_credential?.metadata?.pin_code && (
                        <p className="text-sm font-semibold tracking-wide text-amber-400">
                          PIN: {visit.latest_credential.metadata.pin_code}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="p-6">
            <PaginationControls
              page={page}
              onPageChange={setPage}
              hasPrevious={page > 1}
              totalPages={approvedVisitsQuery.data?.meta?.totalPages}
              hasNext={hasNextPage}
            />
          </div>
        </div>
      </div>
      {isScannerOpen && (
        <CameraScanner 
          onClose={() => setIsScannerOpen(false)}
          onCapture={handleScanCapture}
          title="Verify Guest Identity"
        />
      )}
    </div>
  );
}
