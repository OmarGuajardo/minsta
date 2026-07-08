import type { FeedPost } from "@/lib/feed";
import { proxiedImageUrl } from "@/lib/image-proxy";
import { ImageCarousel } from "@/components/ImageCarousel";

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function FeedList({ posts }: { posts: FeedPost[] }) {
  if (posts.length === 0) {
    return <p className="text-sm text-black/60 dark:text-white/60">No posts from people you follow yet.</p>;
  }

  return (
    <div className="flex flex-col gap-10">
      {posts.map((post) => (
        <article key={post.id} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- Instagram CDN hostnames rotate, so next/image remotePatterns can't be pinned reliably */}
            <img
              src={proxiedImageUrl(post.userProfilePicUrl)}
              alt={post.username}
              className="h-8 w-8 shrink-0 rounded-full object-cover"
            />
            <span className="text-sm font-medium">{post.username}</span>
            <span className="text-xs text-black/50 dark:text-white/50">{formatTimestamp(post.timestamp)}</span>
          </div>

          <ImageCarousel imageUrls={post.imageUrls} alt={`Post by ${post.username}`} />

          {post.caption && (
            <p className="text-sm">
              <span className="font-medium">{post.username}</span> {post.caption}
            </p>
          )}

          {post.comments.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {post.comments.map((comment) => (
                <li key={comment.id}>
                  <span className="font-medium">{comment.username}</span> {comment.text}
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}
