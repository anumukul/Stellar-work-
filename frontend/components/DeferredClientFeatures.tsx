"use client";

import dynamic from "next/dynamic";

// Client-only features deferred until after hydration. They live in their own
// client component because `ssr: false` with next/dynamic is not permitted
// inside a Server Component (the root layout is async/server-rendered).
const CommandPalette = dynamic(() => import("@/components/CommandPalette"), { ssr: false });
const ShortcutCheatSheet = dynamic(() => import("@/components/ShortcutCheatSheet"), { ssr: false });
const OnboardingProvider = dynamic(() => import("@/components/OnboardingProvider"), { ssr: false });
const InstallPrompt = dynamic(() => import("@/components/InstallPrompt"), { ssr: false });
const ServiceWorkerRegistration = dynamic(() => import("@/components/ServiceWorkerRegistration"), { ssr: false });
const AnnouncementBanner = dynamic(() => import("@/components/AnnouncementBanner"), { ssr: false });

export default function DeferredClientFeatures() {
  return (
    <>
      <ServiceWorkerRegistration />
      <AnnouncementBanner />
      <CommandPalette />
      <ShortcutCheatSheet />
      <OnboardingProvider />
      <InstallPrompt />
    </>
  );
}
