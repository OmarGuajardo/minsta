import { NextResponse } from "next/server";
import { InstagrapiError, login, type LoginCredentials } from "@/lib/instagrapi";
import { setSessionCookie } from "@/lib/session";

export async function POST(request: Request) {
  const body = await request.json();

  let credentials: LoginCredentials;
  if (typeof body.sessionid === "string" && body.sessionid) {
    credentials = { sessionid: body.sessionid };
  } else if (typeof body.username === "string" && body.username && typeof body.password === "string" && body.password) {
    credentials = {
      username: body.username,
      password: body.password,
      verificationCode: typeof body.verificationCode === "string" ? body.verificationCode : undefined,
    };
  } else {
    return NextResponse.json(
      { error: "Provide a sessionid, or a username and password.", code: "login_failed" },
      { status: 400 }
    );
  }

  try {
    const sessionId = await login(credentials);
    await setSessionCookie(sessionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof InstagrapiError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json({ error: "Unexpected error logging in.", code: "unknown" }, { status: 500 });
  }
}
