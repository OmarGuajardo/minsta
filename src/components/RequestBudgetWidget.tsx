"use client";

import { useEffect, useState } from "react";

interface RequestBudget {
  hour: { used: number; limit: number };
  day: { used: number; limit: number };
}

const POLL_INTERVAL_MS = 30_000;

export function RequestBudgetWidget() {
  const [budget, setBudget] = useState<RequestBudget | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchBudget() {
      try {
        const res = await fetch("/api/request-budget");
        if (!res.ok) return;
        const data: { request_budget: RequestBudget } = await res.json();
        if (!cancelled) setBudget(data.request_budget);
      } catch {
        // Best-effort — the widget just skips updating this cycle.
      }
    }

    fetchBudget();
    const interval = setInterval(fetchBudget, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!budget) return null;

  return (
    <div className="rounded-md border border-black/10 px-3 py-1.5 text-xs text-black/60 dark:border-white/15 dark:text-white/60">
      IG requests: {budget.hour.used}/{budget.hour.limit} this hour · {budget.day.used}/{budget.day.limit} today
    </div>
  );
}
