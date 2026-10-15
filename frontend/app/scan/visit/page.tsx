'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Loader2, QrCode, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@state/auth.store';
import { buildLoginRedirectPath, getCurrentAppPath, getPortalPathForRole } from '@shared/lib/auth-redirect';
import { isAdminRole, isHostRole, isReceptionRole } from '@shared/lib/roles';
import { useQueryParam } from '@shared/hooks/useQueryParam';

export default function ScanVisitPage() {
  const router = useRouter();
  const hydrated = useAuthStore((state) => state.hydrated);
  const authenticated = useAuthStore((state) => state.authenticated);
  const roles = useAuthStore((state) => state.roles);
  const selectedRole = useAuthStore((state) => state.selectedRole);
  // Derived, never set anywhere else on this page — read straight from the URL
  // rather than copied into state by a mount effect.
  const qrCode = useQueryParam('qr')?.trim() ?? '';
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!hydrated || !authenticated) {
      return;
    }

    if (roles.length > 1 && !selectedRole) {
      const nextPath = getCurrentAppPath() ?? '/scan/visit';
      router.replace(`/select-role?next=${encodeURIComponent(nextPath)}`);
      return;
    }

    const currentRole = selectedRole ?? roles[0] ?? null;
    if (currentRole && (isAdminRole(currentRole) || isReceptionRole(currentRole))) {
      router.replace(`/reception/checkin?qr=${encodeURIComponent(qrCode)}`);
      return;
    }

    if (currentRole && isHostRole(currentRole)) {
      router.replace(`/host/checkin?qr=${encodeURIComponent(qrCode)}`);
      return;
    }

    if (currentRole) {
      router.replace(getPortalPathForRole(currentRole));
    }
  }, [authenticated, hydrated, qrCode, roles, router, selectedRole]);

  const loginHref = useMemo(
    () => buildLoginRedirectPath(getCurrentAppPath() ?? `/scan/visit?qr=${encodeURIComponent(qrCode)}`),
    [qrCode]
  );

  const handleCopy = async () => {
    if (!qrCode || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return;
    }

    await navigator.clipboard.writeText(qrCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="flex h-full items-center justify-center bg-slate-950 px-6 py-12 text-slate-100">
      <div className="w-full max-w-2xl rounded-[2rem] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.15),_transparent_40%),linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(2,6,23,1))] p-6 sm:p-8">
        <div className="flex items-center gap-3 text-sm uppercase tracking-[0.3em] text-slate-500">
          <QrCode className="h-4 w-4 text-cyan-400" />
          Scan assist
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">This QR is ready for staff check-in.</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400 sm:text-base">
          Phone cameras now open a real GMS link. Signed-in reception, host, or admin users will be redirected straight into the check-in console with the visit code prefilled.
        </p>

        {!hydrated ? (
          <div className="mt-8 flex items-center gap-3 rounded-3xl border border-slate-800 bg-slate-950/60 p-5 text-slate-300">
            <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
            Restoring your session and routing you to the right workspace.
          </div>
        ) : (
          <>
            <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">QR token</p>
              <p className="mt-3 break-all font-medium text-white">{qrCode || 'No QR token was found in this link.'}</p>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link
                href={loginHref}
                className="inline-flex items-center justify-center rounded-full bg-cyan-500 px-5 py-3 font-medium text-slate-950 transition hover:bg-cyan-400"
              >
                Open staff check-in
              </Link>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!qrCode}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-700 px-5 py-3 font-medium text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy className="h-4 w-4" />
                {copied ? 'Copied' : 'Copy token'}
              </button>
            </div>

            <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-300">
              <div className="flex items-center gap-2 text-emerald-300">
                <ShieldCheck className="h-4 w-4" />
                Staff roles supported
              </div>
              <p className="mt-3 leading-6 text-slate-400">
                Reception and admin open the front-desk console. Hosts open the host check-in view. Guests can keep this page available and present the QR at reception.
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
