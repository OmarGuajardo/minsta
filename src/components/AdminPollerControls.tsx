"use client";

import { useState } from "react";
import type { AdminStatus, PollRun } from "@/lib/instagrapi";
import { formatRelativeTime } from "@/lib/format-time";

type Action = "pause" | "resume" | "trigger-now";

const STATUS_LABELS: Record<PollRun["status"], { label: string; color: string }> = {
  completed: { label: "Completed", color: "text-green-600 dark:text-green-400" },
  partial_budget: { label: "Stopped early (budget)", color: "text-amber-600 dark:text-amber-400" },
  skipped_budget: { label: "Skipped (budget exhausted)", color: "text-amber-600 dark:text-amber-400" },
  needs_checkpoint: { label: "Needs verification", color: "text-red-600 dark:text-red-400" },
  failed: { label: "Failed", color: "text-red-600 dark:text-red-400" },
};

function formatDuration(seconds: number): string {
  if (seconds < 1) return "<1s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

interface PollerData {
  poller: AdminStatus["poller"];
  last_run: AdminStatus["last_run"];
  upcoming: AdminStatus["upcoming"];
}

export function AdminPollerControls({ initial }: { initial: PollerData }) {
  const [data, setData] = useState(initial);
  const [pending, setPending] = useState<Action | "refresh" | null>(null);

  async function callAction(action: Action) {
    setPending(action);
    try {
      await fetch(`/api/admin/poller/${action}`, { method: "POST" });
      await refresh();
    } finally {
      setPending(null);
    }
  }

  async function refresh() {
    setPending("refresh");
    try {
      const res = await fetch("/api/admin/status");
      if (res.ok) setData(await res.json());
    } finally {
      setPending(null);
    }
  }

  const { poller, last_run: lastRun, upcoming } = data;
  const isBusy = pending !== null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-black/70 dark:text-white/70">
        Runs continuously on a timer (see the interval below), checking a rotating batch of your followed accounts —
        the least-recently-checked ones first — rather than rescanning everyone at once. This is what keeps{" "}
        <span className="font-medium">/feed</span> fast: it always reads from this local cache instead of hitting
        Instagram live.
      </p>

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
            disabled={isBusy}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
          >
            {pending === "resume" ? "Resuming…" : "Resume"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => callAction("pause")}
            disabled={isBusy}
            className="rounded-md border border-black/10 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/15"
          >
            {pending === "pause" ? "Pausing…" : "Pause"}
          </button>
        )}
        <button
          type="button"
          onClick={() => callAction("trigger-now")}
          disabled={isBusy}
          className="rounded-md border border-black/10 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/15"
        >
          {pending === "trigger-now" ? "Triggering…" : "Run now"}
        </button>
        <button
          type="button"
          onClick={refresh}
          disabled={isBusy}
          className="rounded-md border border-black/10 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/15"
        >
          {pending === "refresh" ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <p className="text-xs text-black/60 dark:text-white/60">
        &ldquo;Run now&rdquo; wakes the poller immediately but it still runs in the background — hit Refresh a bit later to see
        its result below.
      </p>

      <div className="rounded-md border border-black/10 p-4 dark:border-white/15">
        <h3 className="mb-2 text-sm font-semibold">Last run</h3>
        {lastRun ? (
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex items-center gap-2">
              <span className={STATUS_LABELS[lastRun.status].color}>{STATUS_LABELS[lastRun.status].label}</span>
              <span className="text-black/60 dark:text-white/60">
                · started {formatRelativeTime(lastRun.started_at)} · took{" "}
                {formatDuration(lastRun.finished_at - lastRun.started_at)}
              </span>
            </div>
            <p className="text-black/70 dark:text-white/70">
              Checked {lastRun.checked_usernames.length} account{lastRun.checked_usernames.length === 1 ? "" : "s"},
              found {lastRun.posts_fetched} post{lastRun.posts_fetched === 1 ? "" : "s"}, used{" "}
              {lastRun.requests_used} Instagram request{lastRun.requests_used === 1 ? "" : "s"}.
            </p>
            {lastRun.checked_usernames.length > 0 && (
              <p className="text-xs text-black/60 dark:text-white/60">
                {lastRun.checked_usernames.map((u) => `@${u}`).join(", ")}
              </p>
            )}
            {lastRun.detail && <p className="text-xs text-black/60 dark:text-white/60">{lastRun.detail}</p>}
          </div>
        ) : (
          <p className="text-sm text-black/60 dark:text-white/60">No runs recorded yet.</p>
        )}
      </div>

      <div className="rounded-md border border-black/10 p-4 dark:border-white/15">
        <h3 className="mb-2 text-sm font-semibold">Upcoming run</h3>
        {upcoming.usernames.length > 0 ? (
          <div className="flex flex-col gap-1 text-sm">
            <p className="text-black/70 dark:text-white/70">
              Next up: {upcoming.usernames.map((u) => `@${u}`).join(", ")}
            </p>
            <p className="text-xs text-black/60 dark:text-white/60">
              Estimated cost: ~{upcoming.estimated_requests} Instagram request
              {upcoming.estimated_requests === 1 ? "" : "s"} (1 for the following list, 1 per account checked).
            </p>
          </div>
        ) : (
          <p className="text-sm text-black/60 dark:text-white/60">
            Nothing queued yet — this fills in once accounts have been tracked (visit /feed to start the rotation).
          </p>
        )}
      </div>
    </div>
  );
}
