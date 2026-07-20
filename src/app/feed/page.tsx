import Link from "next/link";
import { InstagrapiError } from "@/lib/instagrapi";
import { getMyFeed, type FeedPost } from "@/lib/feed";
import { catchAuthError, requireSessionId } from "@/lib/require-session";
import { FeedList } from "@/components/FeedList";
import { RequestBudgetWidget } from "@/components/RequestBudgetWidget";

const RANGE_OPTIONS: Array<{ key: string; label: string; days?: number }> = [
  { key: "1w", label: "1 week", days: 7 },
  { key: "2w", label: "2 weeks", days: 14 },
  { key: "1m", label: "1 month", days: 30 },
  { key: "all", label: "All" },
];
const DEFAULT_RANGE_KEY = "1w";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ refresh?: string; range?: string }>;
}) {
  const sessionId = await requireSessionId();

  const { refresh, range } = await searchParams;
  const forceRefresh = refresh === "1";
  const selectedOption =
    RANGE_OPTIONS.find((option) => option.key === range) ??
    RANGE_OPTIONS.find((option) => option.key === DEFAULT_RANGE_KEY)!;

  let posts: FeedPost[] = [];
  let errorMessage: string | null = null;
  try {
    posts = await catchAuthError(() => getMyFeed(sessionId, forceRefresh, selectedOption.days));
  } catch (err) {
    if (err instanceof InstagrapiError && (err.code === "challenge_required" || err.code === "rate_limited")) {
      errorMessage = err.message;
    } else {
      throw err;
    }
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Feed</h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/feed?range=${selectedOption.key}&refresh=1`}
            className="rounded-md border border-black/10 px-3 py-1.5 text-sm dark:border-white/15"
          >
            Refresh
          </Link>
          <Link href="/profile" className="rounded-md border border-black/10 px-3 py-1.5 text-sm dark:border-white/15">
            Profile
          </Link>
          <Link href="/health" className="rounded-md border border-black/10 px-3 py-1.5 text-sm dark:border-white/15">
            Health
          </Link>
          <Link href="/admin" className="rounded-md border border-black/10 px-3 py-1.5 text-sm dark:border-white/15">
            Admin
          </Link>
        </div>
      </div>

      <RequestBudgetWidget />

      <div className="flex gap-2">
        {RANGE_OPTIONS.map((option) => (
          <Link
            key={option.key}
            href={`/feed?range=${option.key}`}
            className={
              option.key === selectedOption.key
                ? "rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
                : "rounded-md border border-black/10 px-3 py-1.5 text-sm dark:border-white/15"
            }
          >
            {option.label}
          </Link>
        ))}
      </div>

      {errorMessage ? (
        <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
      ) : (
        <FeedList posts={posts} />
      )}
    </main>
  );
}
