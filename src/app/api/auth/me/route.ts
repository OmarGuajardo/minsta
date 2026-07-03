import { NextResponse } from "next/server";
import { getSessionCookie } from "@/lib/session";

export async function GET() {
  const sessionId = await getSessionCookie();
  return NextResponse.json({ authenticated: Boolean(sessionId) });
}
