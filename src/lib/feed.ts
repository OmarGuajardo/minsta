import { getFeed } from "@/lib/instagrapi";
import type { Media } from "@/lib/instagrapi";

export interface FeedComment {
  id: string;
  username: string;
  text: string;
}

export type FeedMediaType = "photo" | "video";

export interface FeedMediaItem {
  type: FeedMediaType;
  url: string;
  posterUrl?: string;
}

export interface FeedPost {
  id: string;
  media: FeedMediaItem[];
  username: string;
  userProfilePicUrl: string;
  caption: string;
  timestamp: string;
  comments: FeedComment[];
}

const CAROUSEL_MEDIA_TYPE = 8;
const VIDEO_MEDIA_TYPE = 2;

function getMediaItems(media: Media): FeedMediaItem[] {
  if (media.media_type === CAROUSEL_MEDIA_TYPE && media.resources.length > 0) {
    return media.resources
      .map((resource): FeedMediaItem | null => {
        if (resource.media_type === VIDEO_MEDIA_TYPE && resource.video_url) {
          return { type: "video", url: resource.video_url, posterUrl: resource.thumbnail_url };
        }
        if (resource.thumbnail_url) {
          return { type: "photo", url: resource.thumbnail_url };
        }
        return null;
      })
      .filter((item): item is FeedMediaItem => item !== null);
  }

  if (media.media_type === VIDEO_MEDIA_TYPE && media.video_url) {
    return [{ type: "video", url: media.video_url, posterUrl: media.thumbnail_url }];
  }

  const single = media.thumbnail_url ?? media.image_versions2?.candidates?.[0]?.url;
  return single ? [{ type: "photo", url: single }] : [];
}

/**
 * Feed of posts from followed accounts only, read from instagrapi-service's
 * local database rather than scanning Instagram live — see that service's
 * /feed for why this isn't an algorithmic timeline, and how the background
 * poller keeps it up to date.
 *
 * `days`, when given, filters to posts within that many days of now
 * (filtered server-side). `forceRefresh` triggers an immediate on-demand
 * poll for this session before reading, instead of waiting for the next
 * scheduled background tick.
 */
export async function getMyFeed(sessionId: string, forceRefresh = false, days?: number): Promise<FeedPost[]> {
  const { items } = await getFeed(sessionId, days, forceRefresh);

  // Comments are intentionally not fetched here right now — one extra
  // sequential private-API call per post (up to ~60 for a full feed) was the
  // single biggest contributor to /feed's load time. Re-add as an on-demand
  // fetch (e.g. "view comments" per post) rather than eagerly for every post.
  return items.map((item) => ({
    id: item.media.id,
    media: getMediaItems(item.media),
    username: item.user.username ?? "",
    userProfilePicUrl: item.user.profile_pic_url ?? "",
    caption: item.media.caption_text ?? "",
    timestamp: item.media.taken_at,
    comments: [],
  }));
}
