"use client";

import { useCallback, useEffect, useRef } from "react";
import TruncatedAddress from "@/components/TruncatedAddress";
import { useModalFocusTrap } from "@/lib/modal";
import { getDailyUrl, saveCallRecord, updateCallRecord, type CallType } from "@/lib/calling";

interface CallOverlayProps {
  myAddress: string;
  peerAddress: string;
  callType: CallType;
  userName: string;
  onClose: () => void;
}

export default function CallOverlay({
  myAddress,
  peerAddress,
  callType,
  userName,
  onClose,
}: CallOverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const callIdRef = useRef<string>("");
  const startTimeRef = useRef<number>(0);

  useModalFocusTrap(true, dialogRef, onClose);

  useEffect(() => {
    callIdRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    startTimeRef.current = Date.now();

    saveCallRecord({
      id: callIdRef.current,
      peerAddress,
      type: callType,
      startedAt: startTimeRef.current,
      status: "ringing",
    });

    return () => {
      const duration = Date.now() - startTimeRef.current;
      updateCallRecord(callIdRef.current, {
        status: "ended",
        endedAt: Date.now(),
        duration,
      });
    };
  }, [peerAddress, callType]);

  const dailyUrl = getDailyUrl(myAddress, peerAddress, callType, userName);

  const handleIframeLoad = useCallback(() => {
    updateCallRecord(callIdRef.current, { status: "connected" });
  }, []);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${callType === "video" ? "Video" : "Voice"} call`}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-4xl mx-4">
        {/* Controls bar */}
        <div className="absolute -top-12 left-0 right-0 flex items-center justify-between z-10">
          <span className="text-sm text-white/70">
            {callType === "video" ? "Video call" : "Voice call"} with{" "}
            <TruncatedAddress address={peerAddress} className="font-mono text-sm text-white/70" />
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              aria-label="End call"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" d="M3.5 16.5c4.5-4.5 12.5-4.5 17 0M5 14c3.5-3 9.5-3 13 0M6.5 11.5c2.5-2.5 7.5-2.5 10 0" />
              </svg>
              End
            </button>
          </div>
        </div>

        {/* Daily.co iframe */}
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-black shadow-2xl">
          <iframe
            src={dailyUrl}
            className="h-full w-full border-0"
            allow="camera; microphone; display-capture; autoplay"
            title={`${callType} call`}
            onLoad={handleIframeLoad}
          />
        </div>
      </div>
    </div>
  );
}
