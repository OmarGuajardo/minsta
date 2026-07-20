import { getProfileCache } from "@/lib/instagrapi";

export interface Profile {
  username: string;
  fullName: string;
  biography: string;
  profilePicUrl: string;
  followerCount: number;
  followingCount: number;
  mediaCount: number;
  fetchedAt: number;
}

/**
 * Own profile, read from instagrapi-service's local cache rather than
 * hitting Instagram live on every page view. `forceRefresh` triggers an
 * immediate on-demand refresh instead of serving the cached copy.
 */
export async function getMyProfile(sessionId: string, forceRefresh = false): Promise<Profile> {
  const cached = await getProfileCache(sessionId, forceRefresh);

  return {
    username: cached.username,
    fullName: cached.full_name,
    biography: cached.biography,
    profilePicUrl: cached.profile_pic_url,
    followerCount: cached.follower_count,
    followingCount: cached.following_count,
    mediaCount: cached.media_count,
    fetchedAt: cached.fetched_at,
  };
}
