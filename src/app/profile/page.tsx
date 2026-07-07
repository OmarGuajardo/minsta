import { redirect } from "next/navigation";
import { InstagramApiError } from "@/lib/instagram-graph";
import { getMyProfile } from "@/lib/profile";
import { getMyPosts } from "@/lib/posts";
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
    posts = await getMyPosts(accessToken);
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
        <LogoutButton />
      </div>
      <PhotoGrid items={posts.items} />
    </main>
  );
}
