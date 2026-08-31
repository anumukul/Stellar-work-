"use client";

import { useState, useEffect } from "react";
import { X, Download, Share } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [engagementLevel, setEngagementLevel] = useState(0);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true) {
      setIsStandalone(true);
      return;
    }

    // Detect iOS for custom Safari instructions
    const ua = window.navigator.userAgent;
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    if (isIOSDevice) {
      setIsIOS(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    
    // Engagement tracking: show prompt after 5 seconds or 3 clicks, if they haven't dismissed it
    const hasDismissed = localStorage.getItem("pwa_prompt_dismissed");
    if (!hasDismissed) {
      const timer = setTimeout(() => {
        setEngagementLevel((prev) => prev + 10);
      }, 5000); // 5 seconds threshold
      
      const clickHandler = () => {
        setEngagementLevel((prev) => prev + 1);
      };
      
      window.addEventListener("click", clickHandler);
      
      return () => {
        window.removeEventListener("beforeinstallprompt", handler);
        clearTimeout(timer);
        window.removeEventListener("click", clickHandler);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    if ((deferredPrompt || isIOS) && !isStandalone && engagementLevel >= 3) {
      const hasDismissed = localStorage.getItem("pwa_prompt_dismissed");
      if (!hasDismissed) {
        setShowPrompt(true);
      }
    }
  }, [deferredPrompt, isIOS, isStandalone, engagementLevel]);

  const handleInstallClick = async () => {
    if (isIOS) {
      // Just showing the instruction, maybe close the banner after
      return;
    }
    if (!deferredPrompt) {
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    // Track install acceptance for analytics
    if (typeof window !== "undefined") {
      try {
         // Custom event for analytics
         window.dispatchEvent(new CustomEvent("pwa_install_outcome", { detail: outcome }));
         console.log("PWA install outcome:", outcome);
      } catch (e) {
         console.error(e);
      }
    }

    if (outcome === "accepted") {
      setShowPrompt(false);
    }

    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("pwa_prompt_dismissed", "true");
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800 rounded-xl p-4 z-50 flex flex-col gap-3 animate-in slide-in-from-bottom-5">
      <button 
        onClick={handleDismiss}
        className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        aria-label="Dismiss install prompt"
      >
        <X className="w-5 h-5" />
      </button>
      
      <div className="pr-6">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          Install StellarWork
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          {isIOS ? (
             <>
               For a native-like app experience, tap <Share className="inline w-4 h-4 mx-1" /> and select <strong>Add to Home Screen</strong>.
             </>
          ) : (
            "Install our app for a faster, native-like experience on your device."
          )}
        </p>
      </div>

      {!isIOS && (
        <div className="flex justify-end gap-2 mt-2">
          <button 
            onClick={handleDismiss}
            className="px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Not now
          </button>
          <button 
            onClick={handleInstallClick}
            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Install App
          </button>
        </div>
      )}
    </div>
  );
}
