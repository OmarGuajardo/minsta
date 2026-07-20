export function formatRelativeTime(timestamp: number | null): string {
  if (timestamp === null) return "Never";
  const diffSeconds = Date.now() / 1000 - timestamp;
  if (diffSeconds < 60) return "Just now";
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} min ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)} hr ago`;
  if (diffSeconds < 86400 * 30) return `${Math.floor(diffSeconds / 86400)} d ago`;

  // Beyond ~30 days, switch to an actual calendar date instead of an
  // ever-growing day count — year only shown when it isn't the current one.
  const date = new Date(timestamp * 1000);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(
    undefined,
    sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }
  );
}
