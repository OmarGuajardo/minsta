import type { Profile } from "@/lib/profile";
import { proxiedImageUrl } from "@/lib/image-proxy";

export function ProfileHeader({ profile }: { profile: Profile }) {
  return (
    <div className="flex items-center gap-6">
      {/* eslint-disable-next-line @next/next/no-img-element -- Instagram CDN hostnames rotate, so next/image remotePatterns can't be pinned reliably */}
      <img
        src={proxiedImageUrl(profile.profilePicUrl)}
        alt={`${profile.username}'s profile picture`}
        width={96}
        height={96}
        className="h-24 w-24 shrink-0 rounded-full object-cover"
      />
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">@{profile.username}</h1>
        {profile.fullName && <p className="text-sm text-black/70 dark:text-white/70">{profile.fullName}</p>}
        <div className="flex gap-4 text-sm">
          <span>
            <strong>{profile.mediaCount}</strong> posts
          </span>
          <span>
            <strong>{profile.followerCount}</strong> followers
          </span>
          <span>
            <strong>{profile.followingCount}</strong> following
          </span>
        </div>
        {profile.biography && <p className="max-w-md text-sm whitespace-pre-line">{profile.biography}</p>}
      </div>
    </div>
  );
}
