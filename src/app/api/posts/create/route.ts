import { NextResponse } from "next/server";
import { InstagrapiError, publishPhoto } from "@/lib/instagrapi";
import { clearSessionCookie, getSessionCookie } from "@/lib/session";

const ALLOWED_TYPES = new Set(["image/jpeg"]);
const MAX_PHOTOS = 10;

export async function POST(request: Request) {
  const sessionId = await getSessionCookie();
  if (!sessionId) {
    return NextResponse.json({ error: "Not authenticated.", code: "not_authenticated" }, { status: 401 });
  }

  const formData = await request.formData();
  const files = formData.getAll("images").filter((entry): entry is File => entry instanceof File);
  const caption = typeof formData.get("caption") === "string" ? (formData.get("caption") as string) : "";

  if (files.length === 0) {
    return NextResponse.json({ error: "At least one photo is required.", code: "unknown" }, { status: 400 });
  }
  if (files.length > MAX_PHOTOS) {
    return NextResponse.json(
      { error: `Instagram allows at most ${MAX_PHOTOS} photos per post.`, code: "unknown" },
      { status: 400 }
    );
  }
  if (files.some((file) => !ALLOWED_TYPES.has(file.type))) {
    return NextResponse.json({ error: "Only JPEG images are supported.", code: "unknown" }, { status: 400 });
  }

  try {
    const media = await publishPhoto(sessionId, files, caption);
    return NextResponse.json({ ok: true, id: media.id });
  } catch (err) {
    if (err instanceof InstagrapiError) {
      if (err.code === "not_authenticated") await clearSessionCookie();
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json({ error: "Unexpected error publishing the post.", code: "unknown" }, { status: 500 });
  }
}
