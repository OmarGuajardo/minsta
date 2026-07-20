import { NextResponse } from "next/server";
import { getAdminStatus } from "@/lib/instagrapi";

export async function GET() {
  const status = await getAdminStatus();
  return NextResponse.json(status);
}
