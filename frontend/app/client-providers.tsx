"use client";

import dynamic from "next/dynamic";
import DeferredClientFeatures from "@/components/DeferredClientFeatures";

const MetricsReporter = dynamic(() => import("@/components/MetricsReporter"), { ssr: false });
const Sidebar = dynamic(() => import("@/components/Sidebar"), { ssr: false });

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DeferredClientFeatures />
      {children}
      <Sidebar />
      <MetricsReporter />
    </>
  );
}
