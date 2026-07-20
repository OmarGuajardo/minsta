"use client";

import { useRequestBudget } from "@/hooks/useRequestBudget";

export function RequestBudgetWidget() {
  const budget = useRequestBudget();
  if (!budget) return null;

  return (
    <div className="rounded-md border border-black/10 px-3 py-1.5 text-xs text-black/60 dark:border-white/15 dark:text-white/60">
      IG requests: {budget.hour.used}/{budget.hour.limit} this hour · {budget.day.used}/{budget.day.limit} today
    </div>
  );
}
