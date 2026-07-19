import { NextResponse } from "next/server";
import { InstagrapiError, setCloseFriend } from "@/lib/instagrapi";
import { clearSessionCookie, getSessionCookie } from "@/lib/session";

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const sessionId = await getSessionCookie();
  if (!sessionId) {
    return NextResponse.json({ error: "Not authenticated.", code: "not_authenticated" }, { status: 401 });
  }

  const { userId } = await params;
  const { isCloseFriend } = await request.json();

  try {
    await setCloseFriend(sessionId, userId, Boolean(isCloseFriend));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof InstagrapiError) {
      if (err.code === "not_authenticated") await clearSessionCookie();
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json({ error: "Unexpected error updating close friend status.", code: "unknown" }, { status: 500 });
  }
}
