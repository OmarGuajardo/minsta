"use client";

import { useState, type FormEvent } from "react";
import type { AdminSettings } from "@/lib/instagrapi";

const FIELDS: Array<{ key: keyof AdminSettings; label: string; min: number; help: string }> = [
  {
    key: "poll_interval_seconds",
    label: "Poll interval (seconds)",
    min: 60,
    help: "How often the background poller wakes up.",
  },
  {
    key: "poll_accounts_per_tick",
    label: "Accounts per tick",
    min: 1,
    help: "How many followed accounts get checked per wake-up.",
  },
  {
    key: "poll_people_limit",
    label: "People limit",
    min: 1,
    help: "Following-list fetch cap per tick.",
  },
  {
    key: "poll_posts_per_account",
    label: "Posts per account",
    min: 1,
    help: "Posts fetched per account per check.",
  },
  {
    key: "max_requests_per_hour",
    label: "Max requests / hour",
    min: 1,
    help: "Self-imposed Instagram API budget cap.",
  },
  {
    key: "max_requests_per_day",
    label: "Max requests / day",
    min: 1,
    help: "Self-imposed Instagram API budget cap.",
  },
];

export function AdminSettingsForm({ initialSettings }: { initialSettings: AdminSettings }) {
  const [values, setValues] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to save settings.");
        return;
      }

      setValues(data.settings);
      setMessage("Saved.");
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <div key={field.key} className="flex flex-col gap-1">
            <label htmlFor={field.key} className="text-sm font-medium">
              {field.label}
            </label>
            <input
              id={field.key}
              type="number"
              min={field.min}
              value={values[field.key]}
              onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: Number(e.target.value) }))}
              className="rounded-md border border-black/10 px-3 py-2 outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/30"
            />
            <p className="text-xs text-black/60 dark:text-white/60">{field.help}</p>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {message && <p className="text-sm text-green-600 dark:text-green-400">{message}</p>}

      <button
        type="submit"
        disabled={saving}
        className="w-fit rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
