import Link from "next/link";
import { getMyProfile } from "@/lib/profile";
import { getAllMyPosts } from "@/lib/posts";
import { withSession } from "@/lib/require-session";
import { formatRelativeTime } from "@/lib/format-time";
import { ProfileHeader } from "@/components/ProfileHeader";
import { PhotoGrid } from "@/components/PhotoGrid";
import { LogoutButton } from "@/components/LogoutButton";
import { RequestBudgetWidget } from "@/components/RequestBudgetWidget";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ refresh?: string }>;
}) {
  const { refresh } = await searchParams;
  const forceRefresh = refresh === "1";

  const { profile, posts } = await withSession(async (sessionId) => {
    const profile = await getMyProfile(sessionId, forceRefresh);
    const posts = await getAllMyPosts(sessionId, forceRefresh);
    return { profile, posts };
  });

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-8">
      <div className="flex items-start justify-between">
        <ProfileHeader profile={profile} />
        <div className="flex items-center gap-2">
          <Link
            href="/post/new"
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
          >
            New post
          </Link>
          <LogoutButton />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <RequestBudgetWidget />
        <div className="flex items-center gap-2 text-xs text-black/60 dark:text-white/60">
          <span>Updated {formatRelativeTime(profile.fetchedAt)}</span>
          <Link href="/profile?refresh=1" className="rounded-md border border-black/10 px-3 py-1.5 dark:border-white/15">
            Refresh
          </Link>
        </div>
      </div>
      <PhotoGrid items={posts} />
    </main>
  );
}
