import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session";

/**
 * Cookies can only be mutated in a Server Action or Route Handler, not during
 * a Server Component render — so pages can't clear the session cookie and
 * call redirect() in the same step. They redirect here instead, where
 * clearing is legal, and this then redirects on to /login.
 */
export async function GET(request: Request) {
  await clearSessionCookie();
  return NextResponse.redirect(new URL("/login?reason=expired", request.url));
}
