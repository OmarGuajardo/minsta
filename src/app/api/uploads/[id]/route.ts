import { NextResponse } from "next/server";
import { getUpload } from "@/lib/upload-store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const upload = getUpload(id);
  if (!upload) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Blob([Uint8Array.from(upload.buffer)]), {
    headers: { "Content-Type": upload.contentType, "Cache-Control": "no-store" },
  });
}
