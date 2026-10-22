"use client";

import { useState } from "react";

const REPOSITORY_URL = "https://github.com/anumukul/Stellar-work-";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0";
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";
const COMMIT_SHA = process.env.NEXT_PUBLIC_COMMIT_SHA ?? "";
const DEPLOY_ENV = process.env.NEXT_PUBLIC_DEPLOY_ENV ?? "development";

const ENV_BADGE: Record<string, { label: string; className: string }> = {
  production: {
    label: "production",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  staging: {
    label: "staging",
    className:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  },
  preview: {
    label: "preview",
    className:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  },
  development: {
    label: "dev",
    className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  },
};

type FooterMessages = {
  siteTagline: string;
  github: string;
  documentation: string;
  tokenomics: string;
  license: string;
  builtOn: string;
  allRightsReserved: string;
  buildTime: string;
  commit: string;
  environment: string;
  appVersion: string;
};

const DEFAULT_MESSAGES: FooterMessages = {
  siteTagline: "Decentralized Escrow Marketplace",
  github: "GitHub",
  documentation: "Documentation",
  tokenomics: "Tokenomics",
  license: "License",
  builtOn: "Built on",
  allRightsReserved: "StellarWork. All rights reserved.",
  buildTime: "Build time",
  commit: "Commit",
  environment: "Environment",
  appVersion: "App version {version}, environment {environment}{commit}",
};

function VersionBadge({ messages }: { messages: FooterMessages }) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const badge = ENV_BADGE[DEPLOY_ENV] ?? ENV_BADGE.development;
  const shortSha = COMMIT_SHA ? COMMIT_SHA.slice(0, 7) : null;
  const buildDate = BUILD_TIME
    ? new Date(BUILD_TIME).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          type="button"
          aria-label={messages.appVersion
            .replace("{version}", APP_VERSION)
            .replace("{environment}", badge.label)
            .replace("{commit}", shortSha ? `, ${messages.commit} ${shortSha}` : "")}
          aria-describedby="version-tooltip"
          className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
          onMouseEnter={() => setTooltipVisible(true)}
          onMouseLeave={() => setTooltipVisible(false)}
          onFocus={() => setTooltipVisible(true)}
          onBlur={() => setTooltipVisible(false)}
        >
          <span>StellarWork v{APP_VERSION}</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.className}`}
            aria-hidden="true"
          >
            {badge.label}
          </span>
        </button>

        {tooltipVisible && (shortSha || buildDate) && (
          <div
            id="version-tooltip"
            role="tooltip"
            className="absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-800"
          >
            <dl className="space-y-1">
              {buildDate && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">
                    {messages.buildTime}
                  </dt>
                  <dd className="font-medium text-slate-700 dark:text-slate-300">
                    {buildDate}
                  </dd>
                </div>
              )}
              {shortSha && (
                <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400">{messages.commit}</dt>
                  <dd className="font-mono font-medium text-slate-700 dark:text-slate-300">
                    {shortSha}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">
                    {messages.environment}
                </dt>
                <dd className="font-medium text-slate-700 dark:text-slate-300">
                  {DEPLOY_ENV}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AppFooter({
  messages = DEFAULT_MESSAGES,
}: {
  messages?: FooterMessages;
}) {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto max-w-5xl px-4">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex flex-col items-center gap-2 md:items-start">
            <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
              StellarWork
            </span>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {messages.siteTagline}
            </p>
          </div>

          <nav
            aria-label="Footer navigation"
            className="flex flex-wrap justify-center gap-8 text-sm font-medium text-slate-600 dark:text-slate-400"
          >
            <a
              href={REPOSITORY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-blue-600 dark:hover:text-blue-400"
            >
              {messages.github}
            </a>
            <a
              href={`${REPOSITORY_URL}/blob/main/docs/README.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-blue-600 dark:hover:text-blue-400"
            >
              {messages.documentation}
            </a>
            <a
              href={`${REPOSITORY_URL}/blob/main/docs/TOKENOMICS.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-blue-600 dark:hover:text-blue-400"
            >
              {messages.tokenomics}
            </a>
            <a
              href={`${REPOSITORY_URL}/blob/main/LICENSE`}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-blue-600 dark:hover:text-blue-400"
            >
              {messages.license}
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-slate-100 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {messages.builtOn}
              </span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Stellar
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-6 sm:flex-row dark:border-slate-800">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            &copy; {new Date().getFullYear()} {messages.allRightsReserved}
          </p>
          <VersionBadge messages={messages} />
        </div>
      </div>
    </footer>
  );
}
