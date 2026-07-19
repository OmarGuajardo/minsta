import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestBudgetStatus, getRotationStatus } from "@/lib/instagrapi";
import { getSessionCookie } from "@/lib/session";
import { FollowedAccountsTable } from "@/components/FollowedAccountsTable";

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
      <div className="h-full bg-foreground" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default async function HealthPage() {
  const sessionId = await getSessionCookie();
  if (!sessionId) {
    redirect("/login");
  }

  const [{ request_budget: budget }, { items: rotation }] = await Promise.all([
    getRequestBudgetStatus(),
    getRotationStatus(sessionId),
  ]);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">System Health</h1>
        <div className="flex items-center gap-2">
          <Link href="/feed" className="rounded-md border border-black/10 px-3 py-1.5 text-sm dark:border-white/15">
            Feed
          </Link>
          <Link href="/profile" className="rounded-md border border-black/10 px-3 py-1.5 text-sm dark:border-white/15">
            Profile
          </Link>
        </div>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">API requests</h2>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-sm">
            <span>This hour</span>
            <span>
              {budget.hour.used} / {budget.hour.limit}
            </span>
          </div>
          <UsageBar used={budget.hour.used} limit={budget.hour.limit} />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-sm">
            <span>Today</span>
            <span>
              {budget.day.used} / {budget.day.limit}
            </span>
          </div>
          <UsageBar used={budget.day.used} limit={budget.day.limit} />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Followed accounts ({rotation.length})</h2>
        {rotation.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            No accounts tracked yet — hit Refresh on the feed to start the rotation.
          </p>
        ) : (
          <FollowedAccountsTable accounts={rotation} />
        )}
      </section>
    </main>
  );
}
