import { cookies } from "next/headers";

const SESSION_COOKIE = "ig_access_token";
const SESSION_MAX_AGE = 60 * 60 * 24 * 60; // ~60 days, matching Instagram's long-lived token lifetime

export async function setSessionCookie(accessToken: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function getSessionCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value;
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
