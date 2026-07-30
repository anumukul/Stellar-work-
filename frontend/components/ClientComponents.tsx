"use client";

import dynamic from "next/dynamic";

const AnnouncementBanner = dynamic(() => import("@/components/AnnouncementBanner"), { ssr: false });
const InstallPrompt = dynamic(() => import("@/components/InstallPrompt"), { ssr: false });
const ServiceWorkerRegistration = dynamic(() => import("@/components/ServiceWorkerRegistration"), { ssr: false });

export default function ClientComponents() {
  return (
    <>
      <ServiceWorkerRegistration />
      <AnnouncementBanner />
      <InstallPrompt />
    </>
  );
}
