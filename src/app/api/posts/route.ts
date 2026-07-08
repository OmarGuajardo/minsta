import { NextResponse } from "next/server";
import { InstagrapiError } from "@/lib/instagrapi";
import { getMyPosts } from "@/lib/posts";
import { clearSessionCookie, getSessionCookie } from "@/lib/session";

export async function GET(request: Request) {
  const sessionId = await getSessionCookie();
  if (!sessionId) {
    return NextResponse.json({ error: "Not authenticated.", code: "not_authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username");
  const amount = Number(searchParams.get("amount") ?? 24);

  if (!username) {
    return NextResponse.json({ error: "username query param is required.", code: "unknown" }, { status: 400 });
  }

  try {
    const posts = await getMyPosts(sessionId, username, amount);
    return NextResponse.json({ items: posts });
  } catch (err) {
    if (err instanceof InstagrapiError) {
      if (err.code === "not_authenticated") await clearSessionCookie();
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json({ error: "Unexpected error fetching posts.", code: "unknown" }, { status: 500 });
  }
}
