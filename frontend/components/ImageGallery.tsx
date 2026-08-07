"use client";

import { useState, useCallback, useRef } from "react";
import Lightbox from "./Lightbox";

export interface GalleryImage {
  src: string;
  thumbnail?: string;
  alt: string;
  caption?: string;
  type?: "image" | "video";
}

interface ImageGalleryProps {
  images: GalleryImage[];
  columns?: number;
}

export default function ImageGallery({ images, columns = 3 }: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [loadedThumbnails, setLoadedThumbnails] = useState<Set<number>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);

  const thumbnailRef = useCallback(
    (node: HTMLDivElement | null, index: number) => {
      if (!node) return;
      if (observerRef.current) observerRef.current.disconnect();
      observerRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setLoadedThumbnails((prev) => new Set(prev).add(index));
              observerRef.current?.unobserve(node);
            }
          });
        },
        { rootMargin: "200px" },
      );
      observerRef.current.observe(node);
    },
    [],
  );

  const openLightbox = useCallback((index: number) => setLightboxIndex(index), []);
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const goNext = useCallback(
    () => setLightboxIndex((prev) => (prev !== null && prev < images.length - 1 ? prev + 1 : prev)),
    [images.length],
  );
  const goPrev = useCallback(
    () => setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev)),
    [],
  );

  if (images.length === 0) return null;

  return (
    <>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.min(columns, images.length)}, 1fr)` }}
        role="list"
        aria-label="Image gallery"
      >
        {images.map((image, index) => (
          <div
            key={index}
            ref={(node) => thumbnailRef(node, index)}
            role="listitem"
            className="group relative aspect-square cursor-pointer rounded-lg border border-slate-200 bg-slate-100"
          >
            <button
              type="button"
              onClick={() => openLightbox(index)}
              className="h-full w-full overflow-hidden rounded-[inherit] text-left"
              aria-label={`${image.alt}${image.caption ? ` — ${image.caption}` : ""}`}
            >
            {loadedThumbnails.has(index) ? (
              <img
                src={image.thumbnail || image.src}
                alt={image.alt}
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <svg className="h-6 w-6 animate-pulse text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
              </div>
            )}
            {image.type === "video" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50">
                  <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
            )}
            </button>
          </div>
        ))}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          images={images}
          currentIndex={lightboxIndex}
          onClose={closeLightbox}
          onNext={goNext}
          onPrev={goPrev}
        />
      )}
    </>
  );
}
