"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const MAX_PHOTOS = 10;
const ALLOWED_TYPE = "image/jpeg";

interface SelectedPhoto {
  file: File;
  previewUrl: string;
}

export function CreatePostForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Revoke object URLs on unmount / whenever the selection changes, so
  // previews don't leak memory as photos are added, removed, or reordered.
  useEffect(() => {
    return () => {
      for (const photo of photos) URL.revokeObjectURL(photo.previewUrl);
    };
  }, [photos]);

  function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? []);
    event.target.value = ""; // allow re-selecting the same file(s) again later

    if (incoming.length === 0) return;

    const nonJpeg = incoming.some((file) => file.type !== ALLOWED_TYPE);
    if (nonJpeg) {
      setError("Only JPEG images are supported.");
      return;
    }

    setError(null);
    setPhotos((prev) => {
      const room = MAX_PHOTOS - prev.length;
      if (room <= 0) {
        setError(`You can post at most ${MAX_PHOTOS} photos.`);
        return prev;
      }
      const accepted = incoming.slice(0, room);
      if (incoming.length > accepted.length) {
        setError(`Only added ${accepted.length} — you can post at most ${MAX_PHOTOS} photos.`);
      }
      return [...prev, ...accepted.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))];
    });
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function movePhoto(index: number, direction: -1 | 1) {
    setPhotos((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (photos.length === 0) {
      setError("Choose at least one JPEG photo to post.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      for (const photo of photos) formData.append("images", photo.file);
      formData.set("caption", caption);

      const res = await fetch("/api/posts/create", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        if (data.code === "not_authenticated") {
          router.push("/login?reason=expired");
          return;
        }
        setError(data.error ?? "Failed to publish post.");
        return;
      }

      router.push("/profile");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canAddMore = photos.length < MAX_PHOTOS;

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Photos (JPEG)</span>
          <span className="text-xs text-black/60 dark:text-white/60">
            {photos.length}/{MAX_PHOTOS}
          </span>
        </div>

        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((photo, index) => (
              <div
                key={photo.previewUrl}
                className="group relative aspect-square overflow-hidden rounded-md border border-black/10 dark:border-white/15"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not an Instagram CDN image */}
                <img src={photo.previewUrl} alt={`Selected photo ${index + 1}`} className="h-full w-full object-cover" />
                {index === 0 && photos.length > 1 && (
                  <span className="absolute top-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    Cover
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/60 px-1 py-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => movePhoto(index, -1)}
                    disabled={index === 0}
                    aria-label="Move left"
                    className="rounded px-1.5 py-0.5 text-xs text-white disabled:opacity-30"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    aria-label="Remove photo"
                    className="rounded px-1.5 py-0.5 text-xs text-white"
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={() => movePhoto(index, 1)}
                    disabled={index === photos.length - 1}
                    aria-label="Move right"
                    className="rounded px-1.5 py-0.5 text-xs text-white disabled:opacity-30"
                  >
                    →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <input
          ref={fileInputRef}
          id="images"
          name="images"
          type="file"
          accept="image/jpeg"
          multiple
          disabled={!canAddMore}
          onChange={handleFilesSelected}
          className="rounded-md border border-black/10 px-3 py-2 outline-none file:mr-3 file:rounded file:border-0 file:bg-foreground file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-background disabled:opacity-50 dark:border-white/15"
        />
        <p className="text-xs text-black/60 dark:text-white/60">
          {photos.length === 0
            ? "Select one photo for a single post, or several for a carousel."
            : "Drag isn't supported yet — use the arrows to reorder. The first photo is the cover."}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="caption" className="text-sm font-medium">
          Caption
        </label>
        <textarea
          id="caption"
          name="caption"
          rows={3}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="rounded-md border border-black/10 px-3 py-2 outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/30"
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting || photos.length === 0}
        className="rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
      >
        {submitting
          ? "Publishing…"
          : photos.length > 1
            ? `Publish carousel (${photos.length} photos)`
            : "Publish to Instagram"}
      </button>
    </form>
  );
}
