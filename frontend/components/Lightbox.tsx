"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Spinner from "@/components/Spinner";
import { useModalFocusTrap } from "@/lib/modal";
import type { GalleryImage } from "./ImageGallery";

interface LightboxProps {
  images: GalleryImage[];
  currentIndex: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}

export default function Lightbox({
  images,
  currentIndex,
  onClose,
  onNext,
  onPrev,
}: LightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showLoading, setShowLoading] = useState(true);

  const handleClose = useCallback(() => {
    onClose();
    setZoomLevel(1);
  }, [onClose]);

  useModalFocusTrap(true, dialogRef, handleClose);

  const current = images[currentIndex];

  useEffect(() => {
    setImageLoaded(false);
    setShowLoading(true);
    setZoomLevel(1);
  }, [currentIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          onPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          onNext();
          break;
        case "Escape":
          e.preventDefault();
          handleClose();
          break;
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onNext, onPrev, handleClose]);

  useEffect(() => {
    if (!dialogRef.current) return;
    const el = dialogRef.current;
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoomLevel((prev) => {
          const next = prev - e.deltaY * 0.002;
          return Math.max(0.5, Math.min(5, next));
        });
      }
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0) onNext();
      else onPrev();
    }
  }, [onNext, onPrev]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) handleClose();
    },
    [handleClose],
  );

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
    setShowLoading(false);
  }, []);

  const handleImageError = useCallback(() => {
    setShowLoading(false);
  }, []);

  if (!current) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Image ${currentIndex + 1} of ${images.length}${current.caption ? `: ${current.caption}` : ""}`}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm text-white/70">
          {currentIndex + 1} of {images.length}
        </span>
        {current.caption && (
          <p className="truncate px-4 text-center text-sm text-white/80">{current.caption}</p>
        )}
        <button
          type="button"
          onClick={handleClose}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          aria-label="Close lightbox"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" d="M6 6l12 12M18 6l-12 12" />
          </svg>
        </button>
      </div>

      {/* Image area */}
      <div className="flex flex-1 items-center justify-center overflow-hidden px-4 pb-4">
        {/* Prev button */}
        {currentIndex > 0 && (
          <button
            type="button"
            onClick={onPrev}
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Previous image"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Image */}
        <div
          className="relative flex items-center justify-center"
          style={{ transform: `scale(${zoomLevel})`, transition: "transform 0.2s ease" }}
        >
          {showLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Spinner size="lg" color="rgba(255,255,255,0.9)" label="Loading image" />
            </div>
          )}
          {current.type === "video" ? (
            <video
              src={current.src}
              controls
              className="max-h-[80vh] max-w-full rounded-lg"
              aria-label={current.alt}
            />
          ) : (
            <img
              ref={imageRef}
              src={current.src}
              alt={current.alt}
              className={`max-h-[80vh] max-w-full rounded-lg object-contain transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
              onLoad={handleImageLoad}
              onError={handleImageError}
              draggable={false}
            />
          )}
        </div>

        {/* Next button */}
        {currentIndex < images.length - 1 && (
          <button
            type="button"
            onClick={onNext}
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Next image"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex gap-3">
          {current.type !== "video" && (
            <a
              href={current.src}
              download
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20 transition-colors"
              aria-label="Download original image"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                <path strokeLinecap="round" d="M12 3v13m0 0l-4-4m4 4l4-4M4 21h16" />
              </svg>
              Download
            </a>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setZoomLevel((p) => Math.max(0.5, p - 0.5))}
            className="rounded bg-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/20"
            aria-label="Zoom out"
          >
            -
          </button>
          <span className="text-xs text-white/50 self-center">{Math.round(zoomLevel * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoomLevel((p) => Math.min(5, p + 0.5))}
            className="rounded bg-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/20"
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
