import { getFeed, getMediaComments } from "@/lib/instagrapi";

export interface FeedComment {
  id: string;
  username: string;
  text: string;
}

export interface FeedPost {
  id: string;
  imageUrl: string;
  username: string;
  userProfilePicUrl: string;
  comments: FeedComment[];
}

/** Feed of posts from followed accounts only — see instagrapi-service's /feed for why this isn't an algorithmic timeline. */
export async function getMyFeed(sessionId: string): Promise<FeedPost[]> {
  const { items } = await getFeed(sessionId);

  const posts: FeedPost[] = [];
  for (const item of items) {
    let comments: FeedComment[] = [];
    try {
      // Sequential, not Promise.all — private-API calls are rate-limit sensitive,
      // and instagrapi's own delay pacing only helps if we don't fire them in parallel.
      const { items: commentItems } = await getMediaComments(sessionId, item.media.id, 5);
      comments = commentItems.map((comment) => ({
        id: comment.pk,
        username: comment.user.username ?? "",
        text: comment.text,
      }));
    } catch {
      // Comments are best-effort — the feed still renders without them.
    }

    posts.push({
      id: item.media.id,
      imageUrl: item.media.thumbnail_url ?? item.media.image_versions2?.candidates?.[0]?.url ?? "",
      username: item.user.username ?? "",
      userProfilePicUrl: item.user.profile_pic_url ?? "",
      comments,
    });
  }

  return posts;
}
