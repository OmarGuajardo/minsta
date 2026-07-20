import { NextResponse } from "next/server";
import { pausePoller, resumePoller, triggerPollerNow } from "@/lib/instagrapi";

export async function POST(_request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;

  if (action === "pause") {
    return NextResponse.json(await pausePoller());
  }
  if (action === "resume") {
    return NextResponse.json(await resumePoller());
  }
  if (action === "trigger-now") {
    return NextResponse.json(await triggerPollerNow());
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
