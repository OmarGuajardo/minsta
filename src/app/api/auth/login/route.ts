import { NextResponse } from "next/server";
import { InstagrapiError, login } from "@/lib/instagrapi";
import { setSessionCookie } from "@/lib/session";

export async function POST(request: Request) {
  const { username, password, verificationCode } = await request.json();

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required.", code: "invalid_credentials" },
      { status: 400 }
    );
  }

  try {
    const sessionId = await login(username, password, verificationCode);
    await setSessionCookie(sessionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof InstagrapiError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json({ error: "Unexpected error logging in.", code: "unknown" }, { status: 500 });
  }
}
