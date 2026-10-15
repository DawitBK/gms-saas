"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { usePwaInstall } from "@shared/hooks/usePwaInstall";

export function InstallAppButton() {
  const { canInstall, isIos, isInstalled, promptInstall } = usePwaInstall();
  const [showIosHint, setShowIosHint] = useState(false);

  if (isInstalled || (!canInstall && !isIos)) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (canInstall ? void promptInstall() : setShowIosHint((v) => !v))}
        className="gms-sidebar-btn flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition"
      >
        <Download className="h-3 w-3" />
        Install App
      </button>
      {showIosHint ? (
        <div className="absolute bottom-full right-0 z-10 mb-2 w-56 rounded-lg border border-slate-800 bg-slate-950 p-3 text-[11px] text-slate-300 shadow-2xl">
          Tap the Share icon, then &quot;Add to Home Screen&quot;.
        </div>
      ) : null}
    </div>
  );
}
