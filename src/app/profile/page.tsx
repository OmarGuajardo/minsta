import { redirect } from "next/navigation";
import { InstagrapiError } from "@/lib/instagrapi";
import { getMyProfile } from "@/lib/profile";
import { getMyPosts } from "@/lib/posts";
import { clearSessionCookie, getSessionCookie } from "@/lib/session";
import { ProfileHeader } from "@/components/ProfileHeader";
import { PhotoGrid } from "@/components/PhotoGrid";
import { LogoutButton } from "@/components/LogoutButton";

export default async function ProfilePage() {
  const sessionId = await getSessionCookie();
  if (!sessionId) {
    redirect("/login");
  }

  let profile;
  let posts;
  try {
    profile = await getMyProfile(sessionId);
    posts = await getMyPosts(sessionId, profile.username);
  } catch (err) {
    if (err instanceof InstagrapiError && err.status === 401) {
      await clearSessionCookie();
      redirect("/login");
    }
    throw err;
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-8">
      <div className="flex items-start justify-between">
        <ProfileHeader profile={profile} />
        <LogoutButton />
      </div>
      <PhotoGrid items={posts.items} />
    </main>
  );
}
