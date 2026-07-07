import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { InstagramApiError, exchangeCodeForToken, exchangeForLongLivedToken } from "@/lib/instagram-graph";
import { setSessionCookie } from "@/lib/session";

const STATE_COOKIE = "ig_oauth_state";

// Behind an ngrok tunnel (or any reverse proxy), request.url reflects the
// dev server's local bind address, not the public host the browser is on —
// so redirects must be built from the forwarded host/proto instead.
function getOrigin(request: Request, requestUrl: URL): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) {
    return `${forwardedProto ?? "https"}://${forwardedHost}`;
  }
  return requestUrl.origin;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const { searchParams } = requestUrl;
  const origin = getOrigin(request, requestUrl);
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
