import Link from "next/link";
import { redirect } from "next/navigation";
import { InstagramApiError } from "@/lib/instagram-graph";
import { getMyProfile } from "@/lib/profile";
import { getAllMyPosts } from "@/lib/posts";
import { clearSessionCookie, getSessionCookie } from "@/lib/session";
import { ProfileHeader } from "@/components/ProfileHeader";
import { PhotoGrid } from "@/components/PhotoGrid";
import { LogoutButton } from "@/components/LogoutButton";

export default async function ProfilePage() {
  const accessToken = await getSessionCookie();
  if (!accessToken) {
    redirect("/login");
  }

  let profile;
  let posts;
  try {
    profile = await getMyProfile(accessToken);
    posts = await getAllMyPosts(accessToken);
  } catch (err) {
    if (err instanceof InstagramApiError && err.code === "not_authenticated") {
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
          <Link
            href="/post/new"
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
          >
            New post
          </Link>
          <LogoutButton />
        </div>
      </div>
      <PhotoGrid items={posts} />
    </main>
  );
}
