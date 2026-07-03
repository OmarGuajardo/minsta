import type { Post } from "@/lib/posts";

export function PhotoGrid({ items }: { items: Post[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-black/60 dark:text-white/60">No posts yet.</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-1">
      {items.map((post) => (
        // eslint-disable-next-line @next/next/no-img-element -- Instagram CDN hostnames rotate, so next/image remotePatterns can't be pinned reliably
        <img
          key={post.id}
          src={post.imageUrl}
          alt={post.caption || "Instagram post"}
          className="aspect-square w-full object-cover"
        />
      ))}
    </div>
  );
}
