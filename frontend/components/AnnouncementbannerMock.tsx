"use client";

import { useState, useEffect } from "react";

export interface AnnouncementConfig {
  id: string;
  type: "info" | "warning" | "error" | "success";
  message: string;
  enabled: boolean;
  expiresAt: number | null;
}

export const ANNOUNCEMENT_STORAGE_KEY = "stellarwork:announcement";
export const DISMISSED_STORAGE_KEY = "stellarwork:dismissed-announcements";

export default function AnnouncementBanner() {
  const [config, setConfig] = useState<AnnouncementConfig | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const loadAnnouncement = () => {
      try {
        const raw = localStorage.getItem(ANNOUNCEMENT_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as AnnouncementConfig;
          if (parsed.enabled) {
            // Check TTL
            if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
              setIsVisible(false);
              return;
            }
            // Check if dismissed
            const dismissedRaw = localStorage.getItem(DISMISSED_STORAGE_KEY);
            let dismissedIds: string[] = [];
            if (dismissedRaw) {
              dismissedIds = JSON.parse(dismissedRaw);
            }
            if (!dismissedIds.includes(parsed.id)) {
              setConfig(parsed);
              setIsVisible(true);
            } else {
              setIsVisible(false);
            }
          } else {
             setIsVisible(false);
          }
        } else {
            setIsVisible(false);
        }
      } catch (e) {
        console.error("Failed to load announcement", e);
      }
    };

    loadAnnouncement();
    
    // Listen for storage changes from other tabs
    window.addEventListener("storage", (e) => {
      if (e.key === ANNOUNCEMENT_STORAGE_KEY || e.key === DISMISSED_STORAGE_KEY) {
        loadAnnouncement();
      }
    });

    // Custom event for same-tab updates
    const handleUpdate = () => loadAnnouncement();
    window.addEventListener("stellarwork:announcement-updated", handleUpdate);
    
    return () => {
      window.removeEventListener("stellarwork:announcement-updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    if (config) {
      try {
        const raw = localStorage.getItem(DISMISSED_STORAGE_KEY);
        const dismissed: string[] = raw ? JSON.parse(raw) : [];
        dismissed.push(config.id);
        localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(dismissed));
      } catch (e) {
        console.error("Failed to dismiss announcement", e);
      }
    }
  };

  if (!isVisible || !config) return null;

  const bgColors = {
    info: "bg-blue-600 text-white",
    warning: "bg-amber-500 text-white",
    error: "bg-red-600 text-white",
    success: "bg-emerald-600 text-white",
  };

  return (
    <div className={`relative px-4 py-3 sm:px-6 lg:px-8 transition-all duration-300 ease-in-out ${bgColors[config.type]}`}>
      <div className="mx-auto max-w-5xl pr-8">
        <div 
          className="text-sm font-medium" 
          dangerouslySetInnerHTML={{ __html: config.message }} 
        />
      </div>
      <button
        onClick={handleDismiss}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-black/10 rounded-md transition-colors"
        aria-label="Dismiss announcement"
      >
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}
