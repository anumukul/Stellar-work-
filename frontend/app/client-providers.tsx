"use client";

import dynamic from "next/dynamic";

const CommandPalette = dynamic(() => import("@/components/CommandPalette"), { ssr: false });
const ShortcutCheatSheet = dynamic(() => import("@/components/ShortcutCheatSheet"), { ssr: false });
const OnboardingProvider = dynamic(() => import("@/components/OnboardingProvider"), { ssr: false });
const InstallPrompt = dynamic(() => import("@/components/InstallPrompt"), { ssr: false });
const ServiceWorkerRegistration = dynamic(() => import("@/components/ServiceWorkerRegistration"), { ssr: false });
const AnnouncementBanner = dynamic(() => import("@/components/AnnouncementBanner"), { ssr: false });
const MetricsReporter = dynamic(() => import("@/components/MetricsReporter"), { ssr: false });
const Sidebar = dynamic(() => import("@/components/Sidebar"), { ssr: false });

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <OnboardingProvider />
      <Sidebar />
      <CommandPalette />
      <ShortcutCheatSheet />
      <InstallPrompt />
      <ServiceWorkerRegistration />
      <AnnouncementBanner />
      <MetricsReporter />
    </>
  );
}
