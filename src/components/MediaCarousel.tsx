"use client";

import { useRef, useState } from "react";
import type { FeedMediaItem } from "@/lib/feed";

export function MediaCarousel({ items, alt }: { items: FeedMediaItem[]; alt: string }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const naturalHeights = useRef<number[]>([]);
  const [containerHeight, setContainerHeight] = useState<number | undefined>(undefined);

  function scroll(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth, behavior: "smooth" });
  }

  // Neither carousel resources nor top-level media carry width/height
  // metadata, so the shared frame height (matching the tallest item) is
  // derived from each photo/video's actual natural size once it loads.
  function recordNaturalSize(index: number, width: number, height: number) {
    const containerWidth = scrollerRef.current?.clientWidth ?? width;
    naturalHeights.current[index] = (height / width) * containerWidth;
    setContainerHeight(Math.max(...naturalHeights.current.filter((h) => !Number.isNaN(h))));
  }

  if (items.length === 0) {
    return null;
  }

  if (items.length === 1) {
    const item = items[0];
    if (item.type === "video") {
      return (
        <video controls poster={item.posterUrl} className="w-full object-contain">
          <source src={item.url} />
        </video>
      );
    }
    // eslint-disable-next-line @next/next/no-img-element -- Instagram CDN hostnames rotate, so next/image remotePatterns can't be pinned reliably
    return <img src={item.url} alt={alt} className="w-full object-contain" />;
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth"
        style={{ scrollbarWidth: "none", height: containerHeight }}
      >
        {items.map((item, index) =>
          item.type === "video" ? (
            <video
              key={index}
              controls
              poster={item.posterUrl}
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                recordNaturalSize(index, video.videoWidth, video.videoHeight);
              }}
              className="w-full shrink-0 snap-center object-contain"
            >
              <source src={item.url} />
            </video>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- Instagram CDN hostnames rotate, so next/image remotePatterns can't be pinned reliably
            <img
              key={index}
              src={item.url}
              alt={`${alt} (${index + 1} of ${items.length})`}
              onLoad={(event) => {
                const img = event.currentTarget;
                recordNaturalSize(index, img.naturalWidth, img.naturalHeight);
              }}
              className="w-full shrink-0 snap-center object-contain"
            />
          )
        )}
      </div>

      <div className="flex justify-center gap-4">
        <button
          type="button"
          aria-label="Previous"
          onClick={() => scroll(-1)}
          className="rounded-full border border-black/10 px-3 py-1 text-lg leading-none dark:border-white/15"
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="Next"
          onClick={() => scroll(1)}
          className="rounded-full border border-black/10 px-3 py-1 text-lg leading-none dark:border-white/15"
        >
          ›
        </button>
      </div>
    </div>
  );
}
