import { NextResponse } from "next/server";

// Instagram serves profile pictures with Cross-Origin-Resource-Policy: same-origin,
// which browsers block when the image is embedded on any other origin (like ours).
// Post photos are served cross-origin and don't need this — only route
// profile-picture URLs through here.
const ALLOWED_HOST_SUFFIXES = [".cdninstagram.com", ".fbcdn.net"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "url query param is required" }, { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  const isAllowedHost = ALLOWED_HOST_SUFFIXES.some((suffix) => targetUrl.hostname.endsWith(suffix));
  if (targetUrl.protocol !== "https:" || !isAllowedHost) {
    return NextResponse.json({ error: "url host not allowed" }, { status: 400 });
  }

  const res = await fetch(targetUrl, { cache: "no-store" });
  if (!res.ok || !res.body) {
    return NextResponse.json({ error: "upstream fetch failed" }, { status: 502 });
  }

  return new NextResponse(res.body, {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
