import { NextResponse } from "next/server";
import { getSessionCookie } from "@/lib/session";

export async function GET() {
  const accessToken = await getSessionCookie();
  return NextResponse.json({ authenticated: Boolean(accessToken) });
}
