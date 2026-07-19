import { NextResponse } from "next/server";
import { InstagrapiError, updateAdminSettings, type AdminSettings } from "@/lib/instagrapi";

export async function POST(request: Request) {
  const updates: Partial<AdminSettings> = await request.json();

  try {
    const status = await updateAdminSettings(updates);
    return NextResponse.json(status);
  } catch (err) {
    if (err instanceof InstagrapiError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json({ error: "Unexpected error updating settings.", code: "unknown" }, { status: 500 });
  }
}
