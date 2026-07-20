"use client";

import { useState } from "react";
import type { RequestLogEntry } from "@/lib/instagrapi";

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function RequestLogTable({ initialItems }: { initialItems: RequestLogEntry[] }) {
  const [items, setItems] = useState(initialItems);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/request-log");
      if (res.ok) {
        const data: { items: RequestLogEntry[] } = await res.json();
        setItems(data.items);
      }
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-black/60 dark:text-white/60">{items.length} requests logged</span>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="rounded-md border border-black/10 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/15"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">No requests logged yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-black/10 dark:border-white/15">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left dark:border-white/15">
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Request</th>
                <th className="px-3 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr
                  key={`${item.timestamp}-${index}`}
                  className="border-b border-black/5 last:border-0 dark:border-white/10"
                >
                  <td className="px-3 py-2 whitespace-nowrap text-black/70 dark:text-white/70">
                    {formatTimestamp(item.timestamp)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{item.label}</td>
                  <td className="px-3 py-2 text-black/60 dark:text-white/60">{item.detail || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
