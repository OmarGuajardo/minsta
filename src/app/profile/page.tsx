import Link from "next/link";
import { redirect } from "next/navigation";
import { InstagrapiError } from "@/lib/instagrapi";
import { getMyProfile } from "@/lib/profile";
import { getAllMyPosts } from "@/lib/posts";
import { clearSessionCookie, getSessionCookie } from "@/lib/session";
import { ProfileHeader } from "@/components/ProfileHeader";
import { PhotoGrid } from "@/components/PhotoGrid";
import { LogoutButton } from "@/components/LogoutButton";
import { RequestBudgetWidget } from "@/components/RequestBudgetWidget";

export default async function ProfilePage() {
  const sessionId = await getSessionCookie();
  if (!sessionId) {
    redirect("/login");
  }

  let profile;
  let posts;
  try {
    profile = await getMyProfile(sessionId);
    posts = await getAllMyPosts(sessionId, profile.username);
  } catch (err) {
    if (err instanceof InstagrapiError && err.code === "not_authenticated") {
      await clearSessionCookie();
      redirect("/login");
    }
    throw err;
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-8">
      <div className="flex items-start justify-between">
        <ProfileHeader profile={profile} />
        <div className="flex items-center gap-2">
          <Link href="/feed" className="rounded-md border border-black/10 px-3 py-1.5 text-sm dark:border-white/15">
            Feed
          </Link>
          <Link href="/health" className="rounded-md border border-black/10 px-3 py-1.5 text-sm dark:border-white/15">
            Health
          </Link>
          <Link
            href="/post/new"
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
          >
            New post
          </Link>
          <LogoutButton />
        </div>
      </div>
      <RequestBudgetWidget />
      <PhotoGrid items={posts} />
    </main>
  );
}
