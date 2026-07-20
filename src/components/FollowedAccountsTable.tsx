"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { proxiedImageUrl } from "@/lib/image-proxy";
import { formatRelativeTime } from "@/lib/format-time";
import type { RotationStatusItem } from "@/lib/instagrapi";

type SortKey = "username" | "last_checked_at" | "latest_post_at" | "is_close_friend";
type SortDirection = "asc" | "desc";

function compareAccounts(a: RotationStatusItem, b: RotationStatusItem, key: SortKey): number {
  if (key === "username") {
    return (a.username ?? a.user_id).localeCompare(b.username ?? b.user_id);
  }
  if (key === "is_close_friend") {
    return Number(b.is_close_friend) - Number(a.is_close_friend);
  }
  const aVal = a[key];
  const bVal = b[key];
  if (aVal === null && bVal === null) return 0;
  if (aVal === null) return 1;
  if (bVal === null) return -1;
  return aVal - bVal;
}

function SortHeader({
  label,
  sortKeyValue,
  className,
  sortKey,
  sortDirection,
  onSort,
}: {
  label: string;
  sortKeyValue: SortKey;
  className?: string;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  const isActive = sortKey === sortKeyValue;
  return (
    <th className={className}>
      <button type="button" onClick={() => onSort(sortKeyValue)} className="flex items-center gap-1 font-medium">
        {label}
        {isActive && <span aria-hidden>{sortDirection === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}

export function FollowedAccountsTable({ accounts: initialAccounts }: { accounts: RotationStatusItem[] }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [sortKey, setSortKey] = useState<SortKey>("last_checked_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const closeFriendCount = accounts.filter((account) => account.is_close_friend).length;

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  async function handleToggleCloseFriend(userId: string, current: boolean) {
    setAccounts((prev) =>
      prev.map((account) => (account.user_id === userId ? { ...account, is_close_friend: !current } : account))
    );

    try {
      const res = await fetch(`/api/rotation/${encodeURIComponent(userId)}/close-friend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCloseFriend: !current }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.code === "not_authenticated") {
          router.push("/login?reason=expired");
          return;
        }
        throw new Error("request failed");
      }
    } catch {
      // Revert on failure — the toggle didn't actually take effect server-side.
      setAccounts((prev) =>
        prev.map((account) => (account.user_id === userId ? { ...account, is_close_friend: current } : account))
      );
    }
  }

  const sorted = [...accounts].sort((a, b) => {
    const cmp = compareAccounts(a, b, sortKey);
    return sortDirection === "asc" ? cmp : -cmp;
  });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-black/60 dark:text-white/60">
        {closeFriendCount > 0
          ? `${closeFriendCount} close friend${closeFriendCount === 1 ? "" : "s"} marked — the background poller now checks only them instead of your whole following list.`
          : "No close friends marked — the poller rotates through your whole following list."}
      </p>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-black/10 text-left text-black/60 dark:border-white/15 dark:text-white/60">
            <SortHeader
              label="Account"
              sortKeyValue="username"
              className="w-1/2 py-2 pr-4"
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
            <SortHeader
              label="Last fetched"
              sortKeyValue="last_checked_at"
              className="w-1/6 py-2 pr-4"
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
            <SortHeader
              label="Most recent post"
              sortKeyValue="latest_post_at"
              className="w-1/6 py-2 pr-4"
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
            <SortHeader
              label="Close friend"
              sortKeyValue="is_close_friend"
              className="w-1/6 py-2"
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
          </tr>
        </thead>
        <tbody className="divide-y divide-black/10 dark:divide-white/15">
          {sorted.map((account) => (
            <tr key={account.user_id}>
              <td className="py-2 pr-4">
                <div className="flex items-center gap-2">
                  {account.profile_pic_url && (
                    // eslint-disable-next-line @next/next/no-img-element -- Instagram CDN hostnames rotate, so next/image remotePatterns can't be pinned reliably
                    <img
                      src={proxiedImageUrl(account.profile_pic_url)}
                      alt={account.username ?? account.user_id}
                      className="h-8 w-8 shrink-0 rounded-full object-cover"
                    />
                  )}
                  <span className="truncate">{account.username ?? account.user_id}</span>
                </div>
              </td>
              <td className="py-2 pr-4 whitespace-nowrap text-black/60 dark:text-white/60">
                {formatRelativeTime(account.last_checked_at)}
              </td>
              <td className="py-2 pr-4 whitespace-nowrap text-black/60 dark:text-white/60">
                {formatRelativeTime(account.latest_post_at)}
              </td>
              <td className="py-2">
                <button
                  type="button"
                  onClick={() => handleToggleCloseFriend(account.user_id, account.is_close_friend)}
                  className={
                    account.is_close_friend
                      ? "rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background"
                      : "rounded-md border border-black/10 px-2 py-1 text-xs dark:border-white/15"
                  }
                >
                  {account.is_close_friend ? "★ Close friend" : "☆ Add"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
