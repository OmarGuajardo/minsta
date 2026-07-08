import { NextResponse } from "next/server";
import { logout } from "@/lib/instagrapi";
import { clearSessionCookie, getSessionCookie } from "@/lib/session";

export async function POST() {
  const sessionId = await getSessionCookie();
  if (sessionId) {
    try {
      await logout(sessionId);
    } catch {
      // best-effort — the cookie is cleared regardless
    }
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
