import { NextResponse } from "next/server";
import {
  InstagramApiError,
  createMediaContainer,
  getContainerStatus,
  getMyProfile,
  publishMediaContainer,
} from "@/lib/instagram-graph";
import { clearSessionCookie, getSessionCookie } from "@/lib/session";
import { getRequestOrigin } from "@/lib/request-origin";
import { deleteUpload, putUpload } from "@/lib/upload-store";

const ALLOWED_TYPES = new Set(["image/jpeg"]);
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  const accessToken = await getSessionCookie();
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated.", code: "not_authenticated" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("image");
  const caption = typeof formData.get("caption") === "string" ? (formData.get("caption") as string) : "";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "An image file is required.", code: "unknown" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Only JPEG images are supported.", code: "unknown" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const uploadId = putUpload(buffer, file.type);
  const imageUrl = `${getRequestOrigin(request)}/api/uploads/${uploadId}`;

  try {
    const profile = await getMyProfile(accessToken);
    const containerId = await createMediaContainer(accessToken, profile.id, imageUrl, caption);

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let status = await getContainerStatus(accessToken, containerId);
    while (status === "IN_PROGRESS" && Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      status = await getContainerStatus(accessToken, containerId);
    }

    if (status !== "FINISHED") {
      return NextResponse.json(
        { error: `Instagram couldn't process the image in time (status: ${status}).`, code: "unknown" },
        { status: 502 }
      );
    }

    const mediaId = await publishMediaContainer(accessToken, profile.id, containerId);
    return NextResponse.json({ ok: true, id: mediaId });
  } catch (err) {
    if (err instanceof InstagramApiError) {
      if (err.code === "not_authenticated") await clearSessionCookie();
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json({ error: "Unexpected error publishing the post.", code: "unknown" }, { status: 500 });
  } finally {
    deleteUpload(uploadId);
  }
}
