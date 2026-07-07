import { NextResponse } from "next/server";
import { InstagramApiError } from "@/lib/instagram-graph";
import { getMyPosts } from "@/lib/posts";
import { clearSessionCookie, getSessionCookie } from "@/lib/session";

export async function GET(request: Request) {
  const accessToken = await getSessionCookie();
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated.", code: "not_authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? 24);
  const cursor = searchParams.get("cursor") ?? undefined;

  try {
    const posts = await getMyPosts(accessToken, limit, cursor);
    return NextResponse.json(posts);
  } catch (err) {
    if (err instanceof InstagramApiError) {
      if (err.code === "not_authenticated") await clearSessionCookie();
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json({ error: "Unexpected error fetching posts.", code: "unknown" }, { status: 500 });
  }
}
