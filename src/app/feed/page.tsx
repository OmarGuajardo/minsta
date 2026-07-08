import Link from "next/link";
import { redirect } from "next/navigation";
import { InstagrapiError } from "@/lib/instagrapi";
import { getMyFeed } from "@/lib/feed";
import { clearSessionCookie, getSessionCookie } from "@/lib/session";
import { FeedList } from "@/components/FeedList";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ refresh?: string }>;
}) {
  const sessionId = await getSessionCookie();
  if (!sessionId) {
    redirect("/login");
  }

  const { refresh } = await searchParams;
  const forceRefresh = refresh === "1";

  let posts;
  try {
    posts = await getMyFeed(sessionId, forceRefresh);
  } catch (err) {
    if (err instanceof InstagrapiError && err.code === "not_authenticated") {
      await clearSessionCookie();
      redirect("/login");
    }
    throw err;
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Feed</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/feed?refresh=1"
            className="rounded-md border border-black/10 px-3 py-1.5 text-sm dark:border-white/15"
          >
            Refresh
          </Link>
          <Link href="/profile" className="rounded-md border border-black/10 px-3 py-1.5 text-sm dark:border-white/15">
            Profile
          </Link>
        </div>
      </div>
      <FeedList posts={posts} />
    </main>
  );
}
