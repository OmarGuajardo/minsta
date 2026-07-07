const AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
const SHORT_LIVED_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH_HOST = "https://graph.instagram.com";
const GRAPH_API_VERSION = "v21.0";

export type InstagramApiErrorCode = "oauth_failed" | "not_authenticated" | "rate_limited" | "unknown";

export class InstagramApiError extends Error {
  status: number;
  code: InstagramApiErrorCode;

  constructor(status: number, code: InstagramApiErrorCode, message: string) {
    super(message);
    this.name = "InstagramApiError";
    this.status = status;
    this.code = code;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/** Builds the Instagram Business Login authorization URL to redirect the user to. */
export function getAuthorizationUrl(state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", requireEnv("INSTAGRAM_APP_ID"));
  url.searchParams.set("redirect_uri", requireEnv("INSTAGRAM_REDIRECT_URI"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "instagram_business_basic");
  url.searchParams.set("state", state);
  return url.toString();
}

// Meta's docs describe this as { data: [{ access_token, user_id, permissions }] },
// but in practice the endpoint returns a flat object — support both shapes.
interface ShortLivedTokenResponse {
  access_token?: string;
  data?: Array<{ access_token: string; user_id: string; permissions: string | string[] }>;
}

/** Exchanges the OAuth `code` for a short-lived (1 hour) access token. */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: requireEnv("INSTAGRAM_APP_ID"),
    client_secret: requireEnv("INSTAGRAM_APP_SECRET"),
    grant_type: "authorization_code",
    redirect_uri: requireEnv("INSTAGRAM_REDIRECT_URI"),
    code,
  });

  const res = await fetch(SHORT_LIVED_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    console.error("[instagram-graph] short-lived token exchange failed:", res.status, await res.text());
    throw new InstagramApiError(res.status, "oauth_failed", "Instagram rejected the authorization code.");
  }

  const body = (await res.json()) as ShortLivedTokenResponse;
  const shortLivedToken = body.access_token ?? body.data?.[0]?.access_token;
  if (!shortLivedToken) {
    console.error("[instagram-graph] short-lived token exchange returned no token:", JSON.stringify(body));
    throw new InstagramApiError(502, "oauth_failed", "Instagram did not return an access token.");
  }
  return shortLivedToken;
}

interface LongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/** Exchanges a short-lived token for a long-lived (60 day) access token. */
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<string> {
  const url = new URL(`${GRAPH_HOST}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", requireEnv("INSTAGRAM_APP_SECRET"));
  url.searchParams.set("access_token", shortLivedToken);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    console.error("[instagram-graph] long-lived token exchange failed:", res.status, await res.text());
    throw new InstagramApiError(res.status, "oauth_failed", "Failed to exchange for a long-lived access token.");
  }

  const body = (await res.json()) as LongLivedTokenResponse;
  return body.access_token;
}

interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number };
}

async function graphFetch<T>(path: string, accessToken: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH_HOST}/${GRAPH_API_VERSION}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    let body: GraphErrorBody | undefined;
    try {
      body = await res.json();
    } catch {
      // non-JSON error body, fall through to generic classification
    }
    throw classifyGraphError(res.status, body);
  }
  return (await res.json()) as T;
}

function classifyGraphError(status: number, body: GraphErrorBody | undefined): InstagramApiError {
  const message = body?.error?.message ?? `Request failed with status ${status}`;
  // Error code 190 is Graph API's standard "invalid/expired access token" code.
  if (status === 401 || body?.error?.code === 190) {
    return new InstagramApiError(status, "not_authenticated", "Your Instagram session has expired — please reconnect.");
  }
  // Codes 4 and 17 are Graph API's application/user rate-limit codes.
  if (status === 429 || body?.error?.code === 4 || body?.error?.code === 17) {
    return new InstagramApiError(status, "rate_limited", "Too many requests to Instagram — please try again later.");
  }
  return new InstagramApiError(status, "unknown", message);
}

export interface GraphProfile {
  id: string;
  username: string;
  name?: string;
  account_type: string;
  profile_picture_url?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  biography?: string;
}

export function getMyProfile(accessToken: string): Promise<GraphProfile> {
  return graphFetch<GraphProfile>("/me", accessToken, {
    fields: "id,username,name,account_type,profile_picture_url,followers_count,follows_count,media_count,biography",
  });
}

export interface GraphMedia {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
}

export interface GraphMediaPage {
  items: GraphMedia[];
  nextCursor?: string;
}

export async function getMyPosts(accessToken: string, limit = 24, cursor?: string): Promise<GraphMediaPage> {
  const params: Record<string, string> = {
    fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
    limit: String(limit),
  };
  if (cursor) params.after = cursor;

  const body = await graphFetch<{ data: GraphMedia[]; paging?: { cursors?: { after?: string } } }>(
    "/me/media",
    accessToken,
    params
  );

  return {
    items: body.data,
    nextCursor: body.paging?.cursors?.after,
  };
}
