import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { InstagramApiError, exchangeCodeForToken, exchangeForLongLivedToken } from "@/lib/instagram-graph";
import { setSessionCookie } from "@/lib/session";
import { getRequestOrigin } from "@/lib/request-origin";

const STATE_COOKIE = "ig_oauth_state";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = getRequestOrigin(request);
  const error = searchParams.get("error");
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, origin));
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/login?error=invalid_state", origin));
  }

  try {
    const shortLivedToken = await exchangeCodeForToken(code);
    const accessToken = await exchangeForLongLivedToken(shortLivedToken);
    await setSessionCookie(accessToken);
  } catch (err) {
    const errorCode = err instanceof InstagramApiError ? err.code : "unknown";
    return NextResponse.redirect(new URL(`/login?error=${errorCode}`, origin));
  }

  return NextResponse.redirect(new URL("/profile", origin));
}
