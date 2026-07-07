import { NextResponse } from "next/server";
import { InstagramApiError } from "@/lib/instagram-graph";
import { getMyProfile } from "@/lib/profile";
import { clearSessionCookie, getSessionCookie } from "@/lib/session";

export async function GET() {
  const accessToken = await getSessionCookie();
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated.", code: "not_authenticated" }, { status: 401 });
  }

  try {
    const profile = await getMyProfile(accessToken);
    return NextResponse.json(profile);
  } catch (err) {
    if (err instanceof InstagramApiError) {
      if (err.code === "not_authenticated") await clearSessionCookie();
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json({ error: "Unexpected error fetching profile.", code: "unknown" }, { status: 500 });
  }
}
