import { getMyPosts as getGraphPosts } from "@/lib/instagram-graph";

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

export async function getMyPosts(accessToken: string, limit = 24, cursor?: string): Promise<PostsPage> {
  const page = await getGraphPosts(accessToken, limit, cursor);

  return {
    items: page.items.map((media) => ({
      id: media.id,
      imageUrl: (media.media_type === "VIDEO" ? media.thumbnail_url : media.media_url) ?? media.media_url ?? "",
      caption: media.caption ?? "",
      likeCount: media.like_count ?? 0,
    })),
    nextCursor: page.nextCursor ?? "",
  };
}

/** Fetches every page of the account's posts, following cursors until exhausted. */
export async function getAllMyPosts(accessToken: string): Promise<Post[]> {
  const items: Post[] = [];
  let cursor: string | undefined;

  do {
    const page = await getMyPosts(accessToken, 24, cursor);
    items.push(...page.items);
    cursor = page.nextCursor || undefined;
  } while (cursor);

  return items;
}
