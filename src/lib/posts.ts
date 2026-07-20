import { getOwnPostsCache, getUserPosts } from "@/lib/instagrapi";
import type { Media } from "@/lib/instagrapi";

export interface Post {
  id: string;
  imageUrl: string;
  caption: string;
  likeCount: number;
}

function toPost(media: Media): Post {
  return {
    id: media.id,
    imageUrl: media.thumbnail_url ?? media.image_versions2?.candidates?.[0]?.url ?? "",
    caption: media.caption_text ?? "",
    likeCount: media.like_count,
  };
}

export async function getMyPosts(sessionId: string, username: string, amount = 24): Promise<Post[]> {
  const page = await getUserPosts(sessionId, username, amount);
  return page.items.map(toPost);
}

/**
 * Every post on your own account, read from instagrapi-service's local
 * cache rather than hitting Instagram on every /profile view. `forceRefresh`
 * triggers an immediate live refetch instead of serving the cached copy.
 */
export async function getAllMyPosts(sessionId: string, forceRefresh = false): Promise<Post[]> {
  const page = await getOwnPostsCache(sessionId, forceRefresh);
  return page.items.map((item) => toPost(item.media));
}
