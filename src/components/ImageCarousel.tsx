"use client";

import { useRef, useState, type SyntheticEvent } from "react";

export function ImageCarousel({ imageUrls, alt }: { imageUrls: string[]; alt: string }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const naturalHeights = useRef<number[]>([]);
  const [containerHeight, setContainerHeight] = useState<number | undefined>(undefined);

  function scroll(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth, behavior: "smooth" });
  }

  // Instagram's carousel resource data has no width/height metadata, so the
  // shared frame height (matching the tallest photo) is derived from each
  // image's actual natural size once it loads in the browser.
  function handleImageLoad(index: number, event: SyntheticEvent<HTMLImageElement>) {
    const img = event.currentTarget;
    const containerWidth = scrollerRef.current?.clientWidth ?? img.naturalWidth;
    naturalHeights.current[index] = (img.naturalHeight / img.naturalWidth) * containerWidth;
    setContainerHeight(Math.max(...naturalHeights.current.filter((height) => !Number.isNaN(height))));
  }

  if (imageUrls.length === 0) {
    return null;
  }

  if (imageUrls.length === 1) {
    // eslint-disable-next-line @next/next/no-img-element -- Instagram CDN hostnames rotate, so next/image remotePatterns can't be pinned reliably
    return <img src={imageUrls[0]} alt={alt} className="w-full object-contain" />;
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth"
        style={{ scrollbarWidth: "none", height: containerHeight }}
      >
        {imageUrls.map((url, index) => (
          // eslint-disable-next-line @next/next/no-img-element -- Instagram CDN hostnames rotate, so next/image remotePatterns can't be pinned reliably
          <img
            key={index}
            src={url}
            alt={`${alt} (${index + 1} of ${imageUrls.length})`}
            onLoad={(event) => handleImageLoad(index, event)}
            className="w-full shrink-0 snap-center object-contain"
          />
        ))}
      </div>

      <div className="flex justify-center gap-4">
        <button
          type="button"
          aria-label="Previous photo"
          onClick={() => scroll(-1)}
          className="rounded-full border border-black/10 px-3 py-1 text-lg leading-none dark:border-white/15"
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="Next photo"
          onClick={() => scroll(1)}
          className="rounded-full border border-black/10 px-3 py-1 text-lg leading-none dark:border-white/15"
        >
          ›
        </button>
      </div>
    </div>
  );
}
