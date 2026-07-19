import { NextResponse } from "next/server";

const DEFAULT_BASE_URL = "http://localhost:8000";

export async function GET() {
  const baseUrl = process.env.INSTAGRAPI_URL ?? DEFAULT_BASE_URL;
  const res = await fetch(new URL("/status", baseUrl), { cache: "no-store" });

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch request budget." }, { status: 502 });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
