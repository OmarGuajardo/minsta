import { NextResponse } from "next/server";
import { InstagrapiError, publishPhoto } from "@/lib/instagrapi";
import { clearSessionCookie, getSessionCookie } from "@/lib/session";

const ALLOWED_TYPES = new Set(["image/jpeg"]);

export async function POST(request: Request) {
  const sessionId = await getSessionCookie();
  if (!sessionId) {
    return NextResponse.json({ error: "Not authenticated.", code: "not_authenticated" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("image");
  const caption = typeof formData.get("caption") === "string" ? (formData.get("caption") as string) : "";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "An image file is required.", code: "unknown" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Only JPEG images are supported.", code: "unknown" }, { status: 400 });
  }

  try {
    const media = await publishPhoto(sessionId, file, caption);
    return NextResponse.json({ ok: true, id: media.id });
  } catch (err) {
    if (err instanceof InstagrapiError) {
      if (err.code === "not_authenticated") await clearSessionCookie();
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json({ error: "Unexpected error publishing the post.", code: "unknown" }, { status: 500 });
  }
}
