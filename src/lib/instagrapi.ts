const DEFAULT_BASE_URL = "http://localhost:8000";

export type InstagrapiErrorCode = "not_authenticated" | "login_failed" | "rate_limited" | "unknown";

export class InstagrapiError extends Error {
  status: number;
  code: InstagrapiErrorCode;

  constructor(status: number, code: InstagrapiErrorCode, message: string) {
    super(message);
    this.name = "InstagrapiError";
    this.status = status;
    this.code = code;
  }
}

interface UpstreamErrorBody {
  detail?: string;
  exc_type?: string;
}

function classifyError(status: number, body: UpstreamErrorBody | undefined): InstagrapiError {
  const detail = body?.detail ?? `Request failed with status ${status}`;
  if (status === 401) {
    return new InstagrapiError(
      status,
      "not_authenticated",
      "Your Instagram session has expired — please log in again."
    );
  }
  if (status === 429 || body?.exc_type === "RateLimitError" || body?.exc_type === "PleaseWaitFewMinutes") {
    return new InstagrapiError(status, "rate_limited", "Too many requests to Instagram — please try again later.");
  }
  return new InstagrapiError(status, "unknown", detail);
}

interface InstagrapiFetchOptions {
  method?: "GET" | "POST";
  sessionId?: string;
  searchParams?: Record<string, string | number | boolean | undefined>;
  form?: Record<string, string | undefined>;
}

function baseUrl(): string {
  return process.env.INSTAGRAPI_URL ?? DEFAULT_BASE_URL;
}

async function instagrapiFetch<T>(path: string, options: InstagrapiFetchOptions = {}): Promise<T> {
  const url = new URL(path, baseUrl());
  if (options.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {};
  if (options.sessionId) headers["X-Session-ID"] = options.sessionId;

  let body: string | undefined;
  if (options.form) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.form)) {
      if (value !== undefined) params.set(key, value);
    }
    body = params.toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    let parsedBody: UpstreamErrorBody | undefined;
    try {
      parsedBody = await res.json();
    } catch {
      // non-JSON error body, fall through to generic classification
    }
    throw classifyError(res.status, parsedBody);
  }

  return (await res.json()) as T;
}

// --- Types matching the subset of instagrapi's pydantic models we use ---

export interface Account {
  pk: string;
  username: string;
  full_name: string;
  is_private: boolean;
  profile_pic_url: string;
  is_verified: boolean;
  biography?: string;
}

export interface UserShort {
  pk: string;
  username?: string;
  full_name?: string;
  profile_pic_url?: string;
  profile_pic_url_hd?: string;
  is_private?: boolean;
  is_verified?: boolean;
}

export interface User {
  pk: string;
  username: string;
  full_name: string;
  is_private: boolean;
  profile_pic_url: string;
  profile_pic_url_hd?: string;
  is_verified: boolean;
  media_count: number;
  follower_count: number;
  following_count: number;
  biography?: string;
}

export interface MediaResource {
  pk: string;
  video_url?: string;
  thumbnail_url?: string;
  media_type: number;
}

export interface Media {
  pk: string;
  id: string;
  code: string;
  taken_at: string;
  media_type: number;
  image_versions2?: { candidates: Array<{ url: string; width: number; height: number }> };
  thumbnail_url?: string;
  resources: MediaResource[];
  user: UserShort;
  comment_count?: number;
  like_count: number;
  caption_text: string;
}

export interface Comment {
  pk: string;
  text: string;
  user: UserShort;
  created_at_utc: string;
  like_count?: number;
}

export interface FeedItem {
  media: Media;
  user: UserShort;
}

/** Logs in via a real Instagram `sessionid` cookie value (extracted from a logged-in browser session). Returns our internal session id. */
export async function login(sessionid: string): Promise<string> {
  const body = await instagrapiFetch<{ session_id: string }>("/auth/login", {
    method: "POST",
    form: { sessionid },
  });
  return body.session_id;
}

export async function logout(sessionId: string): Promise<void> {
  await instagrapiFetch("/auth/logout", { method: "POST", sessionId });
}

export function getAccount(sessionId: string): Promise<Account> {
  return instagrapiFetch<Account>("/account", { sessionId });
}

export function getUserByUsername(sessionId: string, username: string): Promise<User> {
  return instagrapiFetch<User>(`/user/${encodeURIComponent(username)}`, { sessionId });
}

export function getUserPosts(sessionId: string, username: string, amount: number): Promise<{ items: Media[] }> {
  return instagrapiFetch<{ items: Media[] }>(`/user/${encodeURIComponent(username)}/posts`, {
    sessionId,
    searchParams: { amount },
  });
}

/** Feed built only from accounts the logged-in user follows — see instagrapi-service's /feed for why this isn't the algorithmic timeline. */
export function getFeed(
  sessionId: string,
  peopleLimit = 30,
  perUser = 2,
  forceRefresh = false
): Promise<{ items: FeedItem[] }> {
  return instagrapiFetch<{ items: FeedItem[] }>("/feed", {
    sessionId,
    searchParams: { people_limit: peopleLimit, per_user: perUser, force_refresh: forceRefresh },
  });
}

export function getMediaComments(sessionId: string, mediaId: string, amount = 10): Promise<{ items: Comment[] }> {
  return instagrapiFetch<{ items: Comment[] }>(`/media/${encodeURIComponent(mediaId)}/comments`, {
    sessionId,
    searchParams: { amount },
  });
}

export async function publishPhoto(sessionId: string, file: File, caption: string): Promise<Media> {
  const url = new URL("/media/publish_photo", baseUrl());
  const formData = new FormData();
  formData.set("file", file);
  formData.set("caption", caption);

  const res = await fetch(url, {
    method: "POST",
    headers: { "X-Session-ID": sessionId },
    body: formData,
    cache: "no-store",
  });

  if (!res.ok) {
    let parsedBody: UpstreamErrorBody | undefined;
    try {
      parsedBody = await res.json();
    } catch {
      // non-JSON error body, fall through to generic classification
    }
    throw classifyError(res.status, parsedBody);
  }

  return (await res.json()) as Media;
}
