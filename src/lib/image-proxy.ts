/** Routes a same-origin-restricted Instagram profile-picture URL through our proxy so browsers can actually load it. */
export function proxiedImageUrl(url: string): string {
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}
