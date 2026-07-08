// Behind an ngrok tunnel (or any reverse proxy), request.url reflects the
// dev server's local bind address, not the public host the browser is on —
// so absolute URLs must be built from the forwarded host/proto instead.
export function getRequestOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) {
    return `${forwardedProto ?? "https"}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}
