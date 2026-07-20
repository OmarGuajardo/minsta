"use client";

import { useEffect, useState } from "react";

export interface RequestBudget {
  hour: { used: number; limit: number };
  day: { used: number; limit: number };
}

const POLL_INTERVAL_MS = 30_000;

/** Polls the self-imposed Instagram request budget every 30s — shared by RequestBudgetWidget and the sidebar's circular gauges. */
export function useRequestBudget(): RequestBudget | null {
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
        // Best-effort — skip updating this cycle.
      }
    }

    fetchBudget();
    const interval = setInterval(fetchBudget, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return budget;
}
