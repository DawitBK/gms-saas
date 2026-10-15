"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, X, Sparkles, ArrowRight } from "lucide-react";
import Link from "next/link";
import { clsx } from "clsx";
import { useResetOnChange } from '@shared/hooks/useResetOnChange';

interface BookVisitOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BookVisitOnboardingModal({ isOpen, onClose }: BookVisitOnboardingModalProps) {
  const [isVisible, setIsVisible] = useState(false);

  // Opening is immediate, so it is a render-time adjustment: the modal must be
  // mounted in the same render that sets isOpen, or the CSS transition has
  // nothing to animate from.
  useResetOnChange([isOpen], () => {
    if (isOpen) setIsVisible(true);
  });

  // Closing is genuinely time-based — keep the node mounted for the 300ms
  // fade-out — so it stays an effect, where the setState happens in a timer
  // callback rather than in the effect body.
  useEffect(() => {
    if (isOpen) return;
    const timer = setTimeout(() => setIsVisible(false), 300);
    return () => clearTimeout(timer);
  }, [isOpen]);

  if (!isVisible && !isOpen) return null;

  return (
    <div className={clsx(
      "fixed inset-0 z-[10000] flex items-center justify-center p-4 transition-all duration-500",
      isOpen ? "bg-slate-950/90 backdrop-blur-md opacity-100" : "opacity-0 pointer-events-none"
    )}>
      <div className={clsx(
        "relative w-full max-w-xl overflow-hidden rounded-[3rem] border border-white/10 bg-slate-900/50 p-10 shadow-[0_0_80px_rgba(0,0,0,0.5)] ring-1 ring-white/10 backdrop-blur-2xl transition-all duration-700 ease-out",
        isOpen ? "scale-100 translate-y-0 opacity-100" : "scale-90 translate-y-12 opacity-0"
      )}>
        {/* Advanced background gradients */}
        <div className="absolute -left-32 -top-32 h-80 w-80 rounded-full bg-cyan-500/20 blur-[100px] animate-pulse" />
        <div className="absolute -right-32 -bottom-32 h-80 w-80 rounded-full bg-indigo-500/20 blur-[100px] animate-pulse" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-full w-full bg-[radial-gradient(circle_at_50%_50%,_rgba(56,189,248,0.05),_transparent_70%)]" />

        <button 
          onClick={onClose}
          className="absolute right-8 top-8 z-10 rounded-full bg-white/5 p-2.5 text-slate-400 transition-all hover:bg-white/10 hover:text-white active:scale-95"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="relative z-10">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-[2.5rem] bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 text-cyan-400 shadow-[0_0_40px_rgba(34,211,238,0.15)] mb-10 ring-1 ring-white/10">
            <Sparkles className="h-10 w-10 animate-pulse" />
          </div>

          <h2 className="text-4xl font-bold tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-slate-400">
            Premium Intelligence <br/>Welcome to GMS
          </h2>
          
          <p className="mt-6 text-xl leading-relaxed text-slate-300 font-medium">
            Step into the future of enterprise building management. 
          </p>
          
          <p className="mt-4 text-lg leading-relaxed text-slate-400">
            Your journey begins with a seamless booking. We&apos;ve prepared everything to make your first visit efficient and secure.
          </p>

          <div className="mt-12 flex flex-col sm:flex-row gap-5">
            <Link
              href="/dashboard/book"
              onClick={onClose}
              className="group relative flex flex-1 items-center justify-center gap-3 overflow-hidden rounded-2xl bg-cyan-500 py-5 font-bold text-slate-950 transition-all hover:bg-cyan-400 hover:shadow-[0_0_30px_rgba(34,211,238,0.3)] active:scale-[0.98]"
            >
              <CalendarPlus className="h-5 w-5" />
              Book Your First Visit
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1.5" />
            </Link>
            
            <button
              onClick={onClose}
              className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-8 py-5 font-bold text-slate-300 transition-all hover:bg-white/10 hover:text-white active:scale-[0.98]"
            >
              Explore Dashboard
            </button>
          </div>
          
          <div className="mt-10 flex items-center justify-center gap-6 border-t border-white/5 pt-10">
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Security</span>
              <span className="text-sm font-medium text-slate-300">Iron-Clad</span>
            </div>
            <div className="h-8 w-px bg-white/5" />
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Support</span>
              <span className="text-sm font-medium text-slate-300">24/7 Active</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
