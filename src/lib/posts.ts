import { getUserPosts } from "@/lib/instagrapi";

export interface Post {
  id: string;
  imageUrl: string;
  caption: string;
  likeCount: number;
}

export interface PostsPage {
  items: Post[];
  nextCursor: string;
}

export async function getMyPosts(sessionId: string, username: string, amount = 24): Promise<PostsPage> {
  const page = await getUserPosts(sessionId, username, amount);

  return {
    items: page.items.map((media) => ({
      id: media.id,
      imageUrl: media.thumbnail_url ?? media.image_versions2?.candidates?.[0]?.url ?? "",
      caption: media.caption_text ?? "",
      likeCount: media.like_count,
    })),
    nextCursor: page.next_cursor,
  };
}
