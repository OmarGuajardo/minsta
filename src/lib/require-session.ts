import { redirect } from "next/navigation";
import { InstagrapiError } from "@/lib/instagrapi";
import { getSessionCookie } from "@/lib/session";

/** Reads the session cookie, redirecting to /login if it's missing entirely. */
export async function requireSessionId(): Promise<string> {
  const sessionId = await getSessionCookie();
  if (!sessionId) {
    redirect("/login?reason=required");
  }
  return sessionId;
}

/**
 * Runs `fn` and, if it throws instagrapi's "not_authenticated" error (the
 * session cookie is present but Instagram has invalidated the underlying
 * session), redirects to a route handler that clears the cookie and sends
 * the user to /login with an explanatory message — a Server Component
 * render can't mutate cookies itself, only a Server Action or Route Handler
 * can. Any other error is rethrown as-is.
 */
export async function catchAuthError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof InstagrapiError && err.code === "not_authenticated") {
      redirect("/api/auth/expire");
    }
    throw err;
  }
}

/** Combines requireSessionId + catchAuthError for the common case of a single session-scoped fetch. */
export async function withSession<T>(fn: (sessionId: string) => Promise<T>): Promise<T> {
  const sessionId = await requireSessionId();
  return catchAuthError(() => fn(sessionId));
}
