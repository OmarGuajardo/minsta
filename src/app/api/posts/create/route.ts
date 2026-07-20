import { NextResponse } from "next/server";
import { InstagrapiError, publishPost } from "@/lib/instagrapi";
import { clearSessionCookie, getSessionCookie } from "@/lib/session";

const ALLOWED_TYPES = new Set(["image/jpeg", "video/mp4"]);
const MAX_ITEMS = 10;

export async function POST(request: Request) {
  const sessionId = await getSessionCookie();
  if (!sessionId) {
    return NextResponse.json({ error: "Not authenticated.", code: "not_authenticated" }, { status: 401 });
  }

  const formData = await request.formData();
  const files = formData.getAll("media").filter((entry): entry is File => entry instanceof File);
  const caption = typeof formData.get("caption") === "string" ? (formData.get("caption") as string) : "";

  if (files.length === 0) {
    return NextResponse.json({ error: "At least one photo or video is required.", code: "unknown" }, { status: 400 });
  }
  if (files.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `Instagram allows at most ${MAX_ITEMS} items per post.`, code: "unknown" },
      { status: 400 }
    );
  }
  if (files.some((file) => !ALLOWED_TYPES.has(file.type))) {
    return NextResponse.json(
      { error: "Only JPEG photos and MP4 videos are supported.", code: "unknown" },
      { status: 400 }
    );
  }

  try {
    const media = await publishPost(sessionId, files, caption);
    return NextResponse.json({ ok: true, id: media.id });
  } catch (err) {
    if (err instanceof InstagrapiError) {
      if (err.code === "not_authenticated") await clearSessionCookie();
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json({ error: "Unexpected error publishing the post.", code: "unknown" }, { status: 500 });
  }
}
