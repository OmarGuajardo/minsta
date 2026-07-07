import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthorizationUrl } from "@/lib/instagram-graph";

const STATE_COOKIE = "ig_oauth_state";

export async function GET() {
  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // just long enough to complete the OAuth redirect round trip
  });

  return NextResponse.redirect(getAuthorizationUrl(state));
}
