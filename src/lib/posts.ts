import { getUserPosts } from "@/lib/instagrapi";
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

/** Fetches every post on the account — instagrapi's amount=0 means "no limit", so no manual pagination loop is needed here. */
export async function getAllMyPosts(sessionId: string, username: string): Promise<Post[]> {
  const page = await getUserPosts(sessionId, username, 0);
  return page.items.map(toPost);
}
