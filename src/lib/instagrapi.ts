const DEFAULT_BASE_URL = "http://localhost:8000";

export type InstagrapiErrorCode =
  | "not_authenticated"
  | "login_failed"
  | "verification_required"
  | "rate_limited"
  | "challenge_required"
  | "unknown";

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

const SESSION_EXPIRED_MESSAGE = "Your Instagram session has expired — please log in again.";

function classifyError(status: number, body: UpstreamErrorBody | undefined): InstagrapiError {
  const detail = body?.detail ?? `Request failed with status ${status}`;
  const excType = body?.exc_type;

  // TwoFactorRequired only ever comes from a login attempt (existing sessions
  // don't suddenly need a 2FA code), so it's checked before the generic 401
  // handling below.
  if (excType === "TwoFactorRequired") {
    return new InstagrapiError(status, "verification_required", detail);
  }
  if (excType === "LoginRequired" || excType === "ClientLoginRequired") {
    return new InstagrapiError(status, "not_authenticated", SESSION_EXPIRED_MESSAGE);
  }
  if (status === 401) {
    // A 401 with no exc_type is get_client's synthetic "no local session at
    // all" response — genuinely "please log in". A 401 WITH an exc_type came
    // from a login attempt that failed (bad sessionid/password), which is a
    // different situation and shouldn't be worded as "your session expired".
    return excType
      ? new InstagrapiError(status, "login_failed", detail)
      : new InstagrapiError(status, "not_authenticated", SESSION_EXPIRED_MESSAGE);
  }
  if (status === 429 || excType === "RateLimitError" || excType === "PleaseWaitFewMinutes") {
    return new InstagrapiError(status, "rate_limited", detail);
  }
  if (status === 403 || excType === "ChallengeRequired") {
    return new InstagrapiError(status, "challenge_required", detail);
  }
  return new InstagrapiError(status, "unknown", detail);
}

interface InstagrapiFetchOptions {
  method?: "GET" | "POST";
  sessionId?: string;
  searchParams?: Record<string, string | number | boolean | undefined>;
  form?: Record<string, string | undefined>;
  json?: Record<string, unknown>;
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
  } else if (options.json) {
    body = JSON.stringify(options.json);
    headers["Content-Type"] = "application/json";
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

export interface UserShort {
  pk: string;
  username?: string;
  full_name?: string;
  profile_pic_url?: string;
  profile_pic_url_hd?: string;
  is_private?: boolean;
  is_verified?: boolean;
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
  video_url?: string;
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

export type LoginCredentials =
  | { sessionid: string }
  | { username: string; password: string; verificationCode?: string };

/** Logs in via either a real Instagram `sessionid` cookie value, or a username/password (with an optional 2FA code). Returns our internal session id. */
export async function login(credentials: LoginCredentials): Promise<string> {
  const form =
    "sessionid" in credentials
      ? { sessionid: credentials.sessionid }
      : {
          username: credentials.username,
          password: credentials.password,
          verification_code: credentials.verificationCode,
        };
  const body = await instagrapiFetch<{ session_id: string }>("/auth/login", {
    method: "POST",
    form,
  });
  return body.session_id;
}

export async function logout(sessionId: string): Promise<void> {
  await instagrapiFetch("/auth/logout", { method: "POST", sessionId });
}

export interface ProfileCache {
  username: string;
  full_name: string;
  biography: string;
  profile_pic_url: string;
  follower_count: number;
  following_count: number;
  media_count: number;
  fetched_at: number;
}

/**
 * Own profile, read from instagrapi-service's local cache rather than
 * hitting Instagram live on every page view — profile fields change far
 * less often than the feed, so this is a plain cache with a manual
 * `forceRefresh`, not a background-polled rotation like /feed.
 */
export function getProfileCache(sessionId: string, forceRefresh = false): Promise<ProfileCache> {
  return instagrapiFetch<ProfileCache>("/profile", { sessionId, searchParams: { force_refresh: forceRefresh } });
}

export function getUserPosts(sessionId: string, username: string, amount: number): Promise<{ items: Media[] }> {
  return instagrapiFetch<{ items: Media[] }>(`/user/${encodeURIComponent(username)}/posts`, {
    sessionId,
    searchParams: { amount },
  });
}

/**
 * Own posts (for the profile grid), read from instagrapi-service's local
 * cache — same idea as getProfileCache, but for the posts grid instead of
 * the header stats. `forceRefresh` forces a live refetch instead of serving
 * the cached copy.
 */
export function getOwnPostsCache(sessionId: string, forceRefresh = false): Promise<{ items: FeedItem[] }> {
  return instagrapiFetch<{ items: FeedItem[] }>("/profile/posts", {
    sessionId,
    searchParams: { force_refresh: forceRefresh },
  });
}

/**
 * Feed of posts from followed accounts, read from instagrapi-service's local
 * database (kept up to date by its background poller) rather than scanning
 * Instagram live on every request. `days`, when given, filters to posts
 * within that many days of now. `forceRefresh` triggers an immediate
 * on-demand poll for this session before reading, instead of waiting for the
 * next scheduled tick.
 */
export function getFeed(sessionId: string, days?: number, forceRefresh = false): Promise<{ items: FeedItem[] }> {
  return instagrapiFetch<{ items: FeedItem[] }>("/feed", {
    sessionId,
    searchParams: { days, force_refresh: forceRefresh },
  });
}

export interface RotationStatusItem {
  user_id: string;
  username: string | null;
  profile_pic_url: string | null;
  last_checked_at: number | null;
  latest_post_at: number | null;
  is_close_friend: boolean;
}

export function getRotationStatus(sessionId: string): Promise<{ items: RotationStatusItem[] }> {
  return instagrapiFetch<{ items: RotationStatusItem[] }>("/rotation-status", { sessionId });
}

/** Marks/unmarks an account as a close friend. Once any account is marked, the background poller polls ONLY close friends instead of the whole following list. */
export function setCloseFriend(sessionId: string, userId: string, isCloseFriend: boolean): Promise<{ ok: boolean }> {
  return instagrapiFetch<{ ok: boolean }>(`/rotation/${encodeURIComponent(userId)}/close-friend`, {
    method: "POST",
    sessionId,
    form: { is_close_friend: String(isCloseFriend) },
  });
}

export interface AdminSettings {
  poll_interval_seconds: number;
  poll_accounts_per_tick: number;
  poll_people_limit: number;
  poll_posts_per_account: number;
  max_requests_per_hour: number;
  max_requests_per_day: number;
}

export interface PollRun {
  started_at: number;
  finished_at: number;
  checked_usernames: string[];
  posts_fetched: number;
  requests_used: number;
  status: "completed" | "partial_budget" | "skipped_budget" | "needs_checkpoint" | "failed";
  detail: string;
}

export interface AdminStatus {
  settings: AdminSettings;
  poller: { paused: boolean; tracked_sessions: number };
  close_friends: string[];
  last_run: PollRun | null;
  upcoming: { usernames: string[]; estimated_requests: number };
}

export function getAdminStatus(): Promise<AdminStatus> {
  return instagrapiFetch<AdminStatus>("/admin/status");
}

export function updateAdminSettings(updates: Partial<AdminSettings>): Promise<AdminStatus> {
  return instagrapiFetch<AdminStatus>("/admin/settings", { method: "POST", json: updates });
}

export function pausePoller(): Promise<AdminStatus["poller"]> {
  return instagrapiFetch<AdminStatus["poller"]>("/admin/poller/pause", { method: "POST" });
}

export function resumePoller(): Promise<AdminStatus["poller"]> {
  return instagrapiFetch<AdminStatus["poller"]>("/admin/poller/resume", { method: "POST" });
}

export function triggerPollerNow(): Promise<{ ok: boolean }> {
  return instagrapiFetch<{ ok: boolean }>("/admin/poller/trigger-now", { method: "POST" });
}

export interface RequestLogEntry {
  timestamp: number;
  label: string;
  detail: string;
}

/** Timestamped history of every real Instagram request made — what /logs shows. */
export function getRequestLog(limit = 200): Promise<{ items: RequestLogEntry[] }> {
  return instagrapiFetch<{ items: RequestLogEntry[] }>("/admin/request-log", { searchParams: { limit } });
}

export function getMediaComments(sessionId: string, mediaId: string, amount = 10): Promise<{ items: Comment[] }> {
  return instagrapiFetch<{ items: Comment[] }>(`/media/${encodeURIComponent(mediaId)}/comments`, {
    sessionId,
    searchParams: { amount },
  });
}

/** A single photo publishes a normal photo post, a single video publishes a video post, and 2+ files (any mix) publish an Instagram carousel. */
export async function publishPost(sessionId: string, files: File[], caption: string): Promise<Media> {
  const url = new URL("/media/publish", baseUrl());
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
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
