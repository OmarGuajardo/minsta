import { getFeed } from "@/lib/instagrapi";
import type { Media } from "@/lib/instagrapi";

export interface FeedComment {
  id: string;
  username: string;
  text: string;
}

export interface FeedPost {
  id: string;
  imageUrls: string[];
  username: string;
  userProfilePicUrl: string;
  caption: string;
  timestamp: string;
  comments: FeedComment[];
}

const CAROUSEL_MEDIA_TYPE = 8;

function getImageUrls(media: Media): string[] {
  if (media.media_type === CAROUSEL_MEDIA_TYPE && media.resources.length > 0) {
    return media.resources
      .map((resource) => resource.thumbnail_url)
      .filter((url): url is string => Boolean(url));
  }
  const single = media.thumbnail_url ?? media.image_versions2?.candidates?.[0]?.url;
  return single ? [single] : [];
}

/** Feed of posts from followed accounts only — see instagrapi-service's /feed for why this isn't an algorithmic timeline. */
export async function getMyFeed(sessionId: string, forceRefresh = false): Promise<FeedPost[]> {
  const { items } = await getFeed(sessionId, 30, 2, forceRefresh);

  // Comments are intentionally not fetched here right now — one extra
  // sequential private-API call per post (up to ~60 for a full feed) was the
  // single biggest contributor to /feed's load time. Re-add as an on-demand
  // fetch (e.g. "view comments" per post) rather than eagerly for every post.
  return items.map((item) => ({
    id: item.media.id,
    imageUrls: getImageUrls(item.media),
    username: item.user.username ?? "",
    userProfilePicUrl: item.user.profile_pic_url ?? "",
    caption: item.media.caption_text ?? "",
    timestamp: item.media.taken_at,
    comments: [],
  }));
}
