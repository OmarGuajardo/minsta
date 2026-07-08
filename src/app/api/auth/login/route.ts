import { NextResponse } from "next/server";
import { InstagrapiError, login } from "@/lib/instagrapi";
import { setSessionCookie } from "@/lib/session";

export async function POST(request: Request) {
  const { sessionid } = await request.json();

  if (!sessionid || typeof sessionid !== "string") {
    return NextResponse.json({ error: "A sessionid cookie value is required.", code: "login_failed" }, { status: 400 });
  }

  try {
    const sessionId = await login(sessionid);
    await setSessionCookie(sessionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof InstagrapiError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json({ error: "Unexpected error logging in.", code: "unknown" }, { status: 500 });
  }
}
