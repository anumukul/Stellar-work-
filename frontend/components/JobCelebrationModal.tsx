"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FC,
  type ReactNode,
} from "react";
import { useModalFocusTrap } from "@/lib/modal";
import { useToast } from "@/components/ToastProvider";
import { formatJobDuration, toXlm } from "@/lib/format";

export interface JobCelebrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string | number;
  jobTitle?: string;
  amount?: string | number | bigint;
  token?: string;
  createdAt?: string | number | null;
  completedAt?: string | number | null;
  initialRating?: number;
  onRate?: (score: number, comment?: string) => Promise<void> | void;
  isClient?: boolean;
  isFreelancer?: boolean;
  txHash?: string;
  onDownloadCertificate?: () => void;
  /** Force reduced motion for testing or preference overriding */
  forceReducedMotion?: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  rotation: number;
  rotationSpeed: number;
  shape: "rect" | "circle" | "star";
  wobble: number;
  wobbleSpeed: number;
}

const CONFETTI_COLORS = [
  "#6366F1", // Indigo
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#F59E0B", // Amber
  "#10B981", // Emerald
  "#3B82F6", // Blue
  "#F43F5E", // Rose
  "#FBBF24", // Gold
];

export const JobCelebrationModal: FC<JobCelebrationModalProps> = ({
  isOpen,
  onClose,
  jobId,
  jobTitle = `Job #${jobId}`,
  amount,
  token = "XLM",
  createdAt,
  completedAt,
  initialRating = 5,
  onRate,
  isClient = true,
  isFreelancer = false,
  txHash,
  onDownloadCertificate,
  forceReducedMotion,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const { showSuccess } = useToast();

  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState<number>(initialRating);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [ratingSubmitted, setRatingSubmitted] = useState<boolean>(false);
  const [submittingRating, setSubmittingRating] = useState<boolean>(false);
  const [userReducedMotion, setUserReducedMotion] = useState<boolean>(false);

  // Focus trap and escape key handler
  useModalFocusTrap(isOpen, modalRef, onClose);

  // Check user system preference for reduced motion
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!mediaQuery) return;
    setUserReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setUserReducedMotion(e.matches);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  const prefersReducedMotion = forceReducedMotion ?? userReducedMotion;

  // Particle creation logic
  const spawnConfettiBurst = useCallback((count = 120) => {
    if (prefersReducedMotion || typeof window === "undefined") return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const newParticles: Particle[] = [];

    for (let i = 0; i < count; i++) {
      // Create bursts originating from lower left and right cannons + center
      const source = i % 3;
      let originX = width / 2;
      let originY = height * 0.45;
      let angle = (Math.random() * 360 * Math.PI) / 180;
      let speed = Math.random() * 12 + 6;

      if (source === 0) {
        // Left cannon shooting up and right
        originX = width * 0.1;
        originY = height * 0.8;
        angle = -Math.PI / 4 + (Math.random() - 0.5) * 0.7;
        speed = Math.random() * 16 + 10;
      } else if (source === 1) {
        // Right cannon shooting up and left
        originX = width * 0.9;
        originY = height * 0.8;
        angle = (-3 * Math.PI) / 4 + (Math.random() - 0.5) * 0.7;
        speed = Math.random() * 16 + 10;
      }

      const shapes: Array<"rect" | "circle" | "star"> = ["rect", "circle", "star"];
      const shape = shapes[Math.floor(Math.random() * shapes.length)];
      const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];

      newParticles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (source !== 2 ? 4 : 0),
        radius: Math.random() * 6 + 4,
        color,
        alpha: 1,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        shape,
        wobble: Math.random() * 10,
        wobbleSpeed: Math.random() * 0.1 + 0.05,
      });
    }

    particlesRef.current = [...particlesRef.current, ...newParticles];
  }, [prefersReducedMotion]);

  // Canvas animation loop
  useEffect(() => {
    if (!isOpen || prefersReducedMotion) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Initial confetti burst
    spawnConfettiBurst(140);

    let running = true;
    const render = () => {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const gravity = 0.25;
      const drag = 0.985;
      const aliveParticles: Particle[] = [];

      for (const p of particlesRef.current) {
        p.vx *= drag;
        p.vy = p.vy * drag + gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        p.wobble += p.wobbleSpeed;
        p.alpha -= 0.005;

        if (p.alpha > 0 && p.y < canvas.height + 50) {
          aliveParticles.push(p);

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillStyle = p.color;

          const wobbleScale = Math.sin(p.wobble);

          if (p.shape === "circle") {
            ctx.beginPath();
            ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
            ctx.fill();
          } else if (p.shape === "star") {
            ctx.beginPath();
            const spikes = 5;
            const outerRadius = p.radius * 1.3;
            const innerRadius = p.radius * 0.6;
            let rot = (Math.PI / 2) * 3;
            const step = Math.PI / spikes;

            ctx.moveTo(0, -outerRadius);
            for (let i = 0; i < spikes; i++) {
              ctx.lineTo(Math.cos(rot) * outerRadius, Math.sin(rot) * outerRadius);
              rot += step;
              ctx.lineTo(Math.cos(rot) * innerRadius, Math.sin(rot) * innerRadius);
              rot += step;
            }
            ctx.lineTo(0, -outerRadius);
            ctx.closePath();
            ctx.fill();
          } else {
            // Rectangle ribbon
            ctx.fillRect(
              -p.radius,
              -p.radius * 0.6 * wobbleScale,
              p.radius * 2,
              p.radius * 1.2 * wobbleScale,
            );
          }
          ctx.restore();
        }
      }

      particlesRef.current = aliveParticles;

      if (aliveParticles.length > 0) {
        animFrameRef.current = requestAnimationFrame(render);
      }
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      running = false;
      window.removeEventListener("resize", resizeCanvas);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      particlesRef.current = [];
    };
  }, [isOpen, prefersReducedMotion, spawnConfettiBurst]);

  if (!isOpen) return null;

  const durationStr = formatJobDuration(createdAt, completedAt ?? Date.now() / 1000);
  const formattedAmount =
    amount !== undefined && amount !== null
      ? typeof amount === "string" && amount.includes(".")
        ? `${amount} ${token}`
        : `${toXlm(amount)} ${token}`
      : undefined;

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/job/${jobId}`
      : `https://stellarwork.app/job/${jobId}`;

  const shareText = `🎉 Successfully completed and approved Job #${jobId} ("${jobTitle}") on @StellarWork! 🚀 #Stellar #Web3 #Escrow`;

  const copyShareLink = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const input = document.createElement("input");
        input.value = shareUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopied(true);
      showSuccess("Shareable link copied to clipboard!");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      showSuccess("Shareable link copied!");
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `Job #${jobId} Completed on StellarWork`,
          text: shareText,
          url: shareUrl,
        });
      } catch {
        // User cancelled or share not supported
      }
    } else {
      void copyShareLink();
    }
  };

  const openSocialShare = (platform: "twitter" | "linkedin" | "telegram") => {
    const encodedText = encodeURIComponent(shareText);
    const encodedUrl = encodeURIComponent(shareUrl);
    let url = "";

    switch (platform) {
      case "twitter":
        url = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
        break;
      case "linkedin":
        url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
        break;
      case "telegram":
        url = `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`;
        break;
    }

    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handleRatingSubmit = async (score: number) => {
    setRating(score);
    if (!onRate) {
      setRatingSubmitted(true);
      showSuccess(`Rating of ${score} stars recorded!`);
      return;
    }
    setSubmittingRating(true);
    try {
      await onRate(score);
      setRatingSubmitted(true);
      showSuccess(`Rating of ${score} stars submitted!`);
    } catch (e) {
      console.error("Failed to submit rating", e);
    } finally {
      setSubmittingRating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="celebration-modal-title"
      aria-describedby="celebration-modal-desc"
    >
      {/* Background overlay backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
        data-testid="celebration-backdrop"
      />

      {/* Confetti canvas animation */}
      {!prefersReducedMotion && (
        <canvas
          ref={canvasRef}
          className="pointer-events-none fixed inset-0 z-50 h-full w-full"
          data-testid="celebration-canvas"
          aria-hidden="true"
        />
      )}

      {/* Modal Dialog Card */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className="relative z-50 w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl transition-all dark:border-slate-700 dark:bg-slate-900 sm:p-8"
        data-testid="celebration-modal"
      >
        {/* Close Button (X) */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          aria-label="Close celebration dialog"
          data-testid="celebration-close-btn"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Celebration Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 to-indigo-600 text-3xl shadow-lg ring-4 ring-amber-100 dark:ring-amber-900/30">
            🎉
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-500/30">
            <svg
              className="h-3.5 w-3.5 fill-emerald-500"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                clipRule="evenodd"
              />
            </svg>
            Job Completed & Approved
          </span>

          <h2
            id="celebration-modal-title"
            className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl"
          >
            Celebration Time!
          </h2>

          <p
            id="celebration-modal-desc"
            className="mt-2 text-sm text-slate-600 dark:text-slate-300"
          >
            Work for <span className="font-semibold text-slate-900 dark:text-slate-100">{jobTitle}</span> has been successfully approved and payment released.
          </p>
        </div>

        {/* Completion Statistics Card Grid */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {/* Duration Stat */}
          <div className="flex flex-col items-center justify-center rounded-xl bg-slate-50 p-3 text-center ring-1 ring-slate-200/70 dark:bg-slate-800/60 dark:ring-slate-700/60">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Turnaround Time
            </span>
            <span className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100" data-testid="stat-duration">
              {durationStr}
            </span>
          </div>

          {/* Amount Released Stat */}
          <div className="flex flex-col items-center justify-center rounded-xl bg-slate-50 p-3 text-center ring-1 ring-slate-200/70 dark:bg-slate-800/60 dark:ring-slate-700/60">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Payment Released
            </span>
            <span className="mt-1 text-base font-bold text-emerald-600 dark:text-emerald-400" data-testid="stat-amount">
              {formattedAmount ?? "Released"}
            </span>
          </div>

          {/* Rating Display */}
          <div className="col-span-2 flex flex-col items-center justify-center rounded-xl bg-slate-50 p-3 text-center ring-1 ring-slate-200/70 dark:bg-slate-800/60 dark:ring-slate-700/60 sm:col-span-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Job Rating
            </span>
            <div className="mt-1 flex items-center gap-1 text-amber-500" data-testid="stat-rating">
              {[1, 2, 3, 4, 5].map((star) => (
                <span key={star} className="text-sm">
                  {star <= (rating || 5) ? "★" : "☆"}
                </span>
              ))}
              <span className="ml-1 text-xs font-bold text-slate-700 dark:text-slate-300">
                {rating || 5}.0
              </span>
            </div>
          </div>
        </div>

        {/* Rating Prompt for Client */}
        {isClient && !ratingSubmitted && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-center dark:border-amber-900/40 dark:bg-amber-950/30">
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-300">
              Rate your experience with this freelancer:
            </p>
            <div className="mt-2 flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  disabled={submittingRating}
                  onClick={() => handleRatingSubmit(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(null)}
                  className="rounded p-1 text-2xl transition-transform hover:scale-125 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
                  data-testid={`rate-star-${star}`}
                >
                  <span
                    className={
                      star <= (hoverRating ?? rating)
                        ? "text-amber-500"
                        : "text-slate-300 dark:text-slate-600"
                    }
                  >
                    ★
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Share to Social Section */}
        <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-800">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Share this milestone
          </p>

          <div className="mt-3 flex items-center justify-center gap-2">
            {/* Twitter / X */}
            <button
              type="button"
              onClick={() => openSocialShare("twitter")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              data-testid="share-twitter-btn"
            >
              <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              X / Twitter
            </button>

            {/* LinkedIn */}
            <button
              type="button"
              onClick={() => openSocialShare("linkedin")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              data-testid="share-linkedin-btn"
            >
              <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
              LinkedIn
            </button>

            {/* Telegram */}
            <button
              type="button"
              onClick={() => openSocialShare("telegram")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              data-testid="share-telegram-btn"
            >
              <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.46-1.901-.903-1.056-.692-1.653-1.123-2.678-1.798-1.185-.781-.417-1.21.258-1.911.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.151-.056-.213-.07-.062-.174-.041-.249-.024-.106.024-1.793 1.126-5.061 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.324-.437.892-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.002.321.023.464.141.119.098.152.23.168.323.016.093.036.305.02.472z" />
              </svg>
              Telegram
            </button>

            {/* Copy Link */}
            <button
              type="button"
              onClick={copyShareLink}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              data-testid="share-copy-link-btn"
            >
              {copied ? (
                <>
                  <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy Link
                </>
              )}
            </button>
          </div>
        </div>

        {/* Modal Action Buttons Footer */}
        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-between sm:gap-3">
          {!prefersReducedMotion ? (
            <button
              type="button"
              onClick={() => spawnConfettiBurst(80)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              data-testid="re-celebrate-btn"
            >
              <span>🎉</span> Celebrate Again
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            {isFreelancer && onDownloadCertificate && (
              <button
                type="button"
                onClick={onDownloadCertificate}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-indigo-900/40 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/60 sm:flex-none"
                data-testid="celebration-certificate-btn"
              >
                📜 Certificate
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:bg-indigo-600 dark:hover:bg-indigo-500 sm:flex-none"
              data-testid="celebration-done-btn"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobCelebrationModal;
