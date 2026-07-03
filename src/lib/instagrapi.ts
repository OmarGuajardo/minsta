const DEFAULT_BASE_URL = "http://localhost:8000";

export type InstagrapiErrorCode =
  | "verification_required"
  | "challenge_required"
  | "invalid_credentials"
  | "not_authenticated"
  | "rate_limited"
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

// aiograpi-rest's global exception handler shape for most non-2xx responses.
interface UpstreamErrorBody {
  detail?: string;
  exc_type?: string;
}

function classifyError(status: number, body: UpstreamErrorBody | undefined): InstagrapiError {
  const detail = body?.detail ?? `Request failed with status ${status}`;
  switch (body?.exc_type) {
    case "TwoFactorRequired":
      return new InstagrapiError(status, "verification_required", detail);
    case "ChallengeRequired":
      return new InstagrapiError(
        status,
        "challenge_required",
        "Instagram requires additional verification (checkpoint), which isn't supported yet. Try logging in from the official Instagram app first, then retry here."
      );
    case "UnknownError":
    case "BadPassword":
    case "BadCredentials":
      return new InstagrapiError(status, "invalid_credentials", "Incorrect username or password.");
  }
  if (status === 401 && detail === "Session ID required") {
    return new InstagrapiError(status, "not_authenticated", detail);
  }
  if (status === 429) {
    return new InstagrapiError(status, "rate_limited", "Too many attempts — please try again later.");
  }
  return new InstagrapiError(status, "unknown", detail);
}

interface InstagrapiFetchOptions {
  method?: "GET" | "POST";
  sessionId?: string;
  searchParams?: Record<string, string | number | undefined>;
  form?: Record<string, string | undefined>;
}

async function instagrapiFetch<T>(path: string, options: InstagrapiFetchOptions = {}): Promise<T> {
  const baseUrl = process.env.INSTAGRAPI_URL ?? DEFAULT_BASE_URL;
  const url = new URL(path, baseUrl);
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

export interface Account {
  pk: string;
  username: string;
  full_name: string;
  is_private: boolean;
  profile_pic_url: string;
  is_verified: boolean;
  biography?: string;
}

export interface InstagramUser {
  pk: string;
  username: string;
  full_name: string;
  profile_pic_url: string;
  profile_pic_url_hd?: string;
  is_private: boolean;
  media_count: number;
  follower_count: number;
  following_count: number;
  biography?: string;
}

export interface Media {
  pk: string;
  id: string;
  code: string;
  thumbnail_url?: string;
  image_versions2?: { candidates: Array<{ url: string; width: number; height: number }> };
  caption_text: string;
  like_count: number;
  comment_count?: number;
}

export interface MediaPage {
  items: Media[];
  next_cursor: string;
}

/** Logs in with username/password (+ optional 2FA code) and returns the aiograpi-rest session id. */
export async function login(username: string, password: string, verificationCode?: string): Promise<string> {
  const sessionId = await instagrapiFetch<string | false>("/auth/login", {
    method: "POST",
    form: { username, password, verification_code: verificationCode },
  });
  if (!sessionId) {
    throw new InstagrapiError(401, "invalid_credentials", "Login failed — check your username and password.");
  }
  return sessionId;
}

/** Own account identity fields (no follower/following counts — see getUserByUsername). */
export function getAccount(sessionId: string): Promise<Account> {
  return instagrapiFetch<Account>("/account", { sessionId });
}

/** Public-shaped user lookup, which is where follower/following counts live. */
export function getUserByUsername(sessionId: string, username: string): Promise<InstagramUser> {
  return instagrapiFetch<InstagramUser>("/user", { sessionId, searchParams: { username } });
}

export function getUserPosts(
  sessionId: string,
  username: string,
  amount: number,
  cursor?: string
): Promise<MediaPage> {
  return instagrapiFetch<MediaPage>("/user/posts", {
    sessionId,
    searchParams: { username, amount, cursor },
  });
}
