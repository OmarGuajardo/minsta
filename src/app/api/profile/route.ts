import { NextResponse } from "next/server";
import { InstagrapiError } from "@/lib/instagrapi";
import { getMyProfile } from "@/lib/profile";
import { clearSessionCookie, getSessionCookie } from "@/lib/session";

export async function GET() {
  const sessionId = await getSessionCookie();
  if (!sessionId) {
    return NextResponse.json({ error: "Not authenticated.", code: "not_authenticated" }, { status: 401 });
  }

  try {
    const profile = await getMyProfile(sessionId);
    return NextResponse.json(profile);
  } catch (err) {
    if (err instanceof InstagrapiError) {
      if (err.status === 401) await clearSessionCookie();
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json({ error: "Unexpected error fetching profile.", code: "unknown" }, { status: 500 });
  }
}
