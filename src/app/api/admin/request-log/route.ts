import { NextResponse } from "next/server";
import { getRequestLog } from "@/lib/instagrapi";

export async function GET() {
  const log = await getRequestLog();
  return NextResponse.json(log);
}
