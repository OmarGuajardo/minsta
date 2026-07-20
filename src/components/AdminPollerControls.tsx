"use client";

import { useState } from "react";
import type { AdminStatus } from "@/lib/instagrapi";

type Action = "pause" | "resume" | "trigger-now";

export function AdminPollerControls({ initialPoller }: { initialPoller: AdminStatus["poller"] }) {
  const [poller, setPoller] = useState(initialPoller);
  const [pending, setPending] = useState<Action | null>(null);

  async function callAction(action: Action) {
    setPending(action);
    try {
      const res = await fetch(`/api/admin/poller/${action}`, { method: "POST" });
      const data = await res.json();
      if (action !== "trigger-now") {
        setPoller(data);
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm">
        <span
          aria-hidden
          className={poller.paused ? "h-2 w-2 rounded-full bg-yellow-500" : "h-2 w-2 rounded-full bg-green-500"}
        />
        <span>{poller.paused ? "Paused" : "Running"}</span>
        <span className="text-black/60 dark:text-white/60">— {poller.tracked_sessions} session(s) tracked</span>
      </div>

      <div className="flex gap-2">
        {poller.paused ? (
          <button
            type="button"
            onClick={() => callAction("resume")}
            disabled={pending !== null}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
          >
            {pending === "resume" ? "Resuming…" : "Resume"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => callAction("pause")}
            disabled={pending !== null}
            className="rounded-md border border-black/10 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/15"
          >
            {pending === "pause" ? "Pausing…" : "Pause"}
          </button>
        )}
        <button
          type="button"
          onClick={() => callAction("trigger-now")}
          disabled={pending !== null}
          className="rounded-md border border-black/10 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/15"
        >
          {pending === "trigger-now" ? "Triggering…" : "Run now"}
        </button>
      </div>
    </div>
  );
}
