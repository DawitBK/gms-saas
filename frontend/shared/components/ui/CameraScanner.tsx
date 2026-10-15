"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Camera, FlipHorizontal, X, Scan, Check, Loader2, AlertCircle } from "lucide-react";
import clsx from "clsx";

interface CameraScannerProps {
  onCapture: (base64Image: string) => void;
  onClose: () => void;
  title?: string;
}

export function CameraScanner({ onCapture, onClose, title = "Scan Document" }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Not React state: nothing renders off the live stream, and the
  // unmount/facingMode-change cleanup below must stop whatever the CURRENT
  // stream actually is, not a value captured in a stale render's closure —
  // a ref always reflects the latest value regardless of when the effect
  // that reads it was created.
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [error, setError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  // A promise chain rather than async/await: this is called from the effect
  // below, and react-hooks/set-state-in-effect (an error under
  // eslint-config-next 16) reads every setState in an async function body as
  // synchronous — it does not treat `await` as a boundary. In a `.then()`
  // callback the setState is unambiguously deferred.
  const startCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    return navigator.mediaDevices
      .getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      .then((newStream) => {
        streamRef.current = newStream;
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
        }
        setIsReady(true);
        setError(null);
      })
      .catch((err) => {
        console.error("Camera access error:", err);
        setError("Unable to access camera. Please ensure you have granted permissions.");
      });
  }, [facingMode]);

  useEffect(() => {
    void startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, [startCamera]);

  const toggleCamera = () => {
    setIsReady(false);
    setFacingMode(prev => (prev === "user" ? "environment" : "user"));
  };

  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    setIsCapturing(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    
    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL("image/jpeg", 0.8);
      
      // Visual feedback: brief flash
      setTimeout(() => {
        onCapture(base64);
        setIsCapturing(false);
      }, 300);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-[2.5rem] border border-slate-800 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
              <Scan className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white">{title}</h3>
              <p className="text-xs text-slate-400">Position the document within the frame</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Viewport */}
        <div className="relative aspect-video w-full bg-black overflow-hidden group">
          {error ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
              <AlertCircle className="h-12 w-12 text-rose-500" />
              <p className="text-sm text-slate-200">{error}</p>
              <button 
                onClick={startCamera}
                className="rounded-full bg-slate-800 px-6 py-2 text-sm font-medium text-white hover:bg-slate-700 transition"
              >
                Try Again
              </button>
            </div>
          ) : (
            <>
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted
                className={clsx(
                  "h-full w-full object-cover transition-opacity duration-500",
                  isReady ? "opacity-100" : "opacity-0"
                )}
              />
              
              {/* Scanning Overlay UI */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                 {/* Guides */}
                 <div className="relative h-3/4 w-3/4 max-w-[500px] border-2 border-dashed border-cyan-400/30 rounded-3xl overflow-hidden">
                    {/* Laser line animation */}
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-[scan_2s_infinite]" />
                    
                    {/* Corners */}
                    <div className="absolute top-0 left-0 h-8 w-8 border-l-4 border-t-4 border-cyan-400 rounded-tl-xl" />
                    <div className="absolute top-0 right-0 h-8 w-8 border-r-4 border-t-4 border-cyan-400 rounded-tr-xl" />
                    <div className="absolute bottom-0 left-0 h-8 w-8 border-l-4 border-b-4 border-cyan-400 rounded-bl-xl" />
                    <div className="absolute bottom-0 right-0 h-8 w-8 border-r-4 border-b-4 border-cyan-400 rounded-br-xl" />
                 </div>
              </div>

              {!isReady && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-10 w-10 animate-spin text-cyan-500" />
                </div>
              )}

              {isCapturing && (
                <div className="absolute inset-0 bg-white opacity-40 animate-flash" />
              )}
            </>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-6 bg-slate-900/50 px-6 py-8">
          <button 
            type="button"
            onClick={toggleCamera}
            disabled={!isReady || error !== null}
            className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition disabled:opacity-50"
            title="Switch Camera"
          >
            <FlipHorizontal className="h-6 w-6" />
          </button>

          <button 
            type="button"
            onClick={captureImage}
            disabled={!isReady || error !== null}
            className="group relative flex h-20 w-20 items-center justify-center rounded-full bg-white transition hover:scale-110 disabled:opacity-50 disabled:hover:scale-100 shadow-2xl active:scale-95"
          >
            <div className="h-16 w-16 rounded-full border-4 border-slate-950 transition-all group-hover:border-cyan-500" />
            <Camera className="absolute h-8 w-8 text-slate-950" />
          </button>

          <div className="h-14 w-14" /> {/* Spacer for symmetry */}
        </div>
        
        <canvas ref={canvasRef} className="hidden" />
      </div>

      <style jsx global>{`
        @keyframes scan {
          0% { transform: translateY(0); opacity: 0.2; }
          50% { opacity: 1; }
          100% { transform: translateY(350px); opacity: 0.2; }
        }
        @keyframes flash {
          0% { opacity: 0.6; }
          100% { opacity: 0; }
        }
        .animate-flash {
          animation: flash 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
