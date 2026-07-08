"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function CreatePostForm() {
  const router = useRouter();
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Choose a JPEG image to post.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("image", file);
      formData.set("caption", caption);

      const res = await fetch("/api/posts/create", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
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

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="image" className="text-sm font-medium">
          Photo (JPEG)
        </label>
        <input
          id="image"
          name="image"
          type="file"
          accept="image/jpeg"
          required
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="rounded-md border border-black/10 px-3 py-2 outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/30"
        />
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
        disabled={submitting}
        className="rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
      >
        {submitting ? "Publishing…" : "Publish to Instagram"}
      </button>
    </form>
  );
}
