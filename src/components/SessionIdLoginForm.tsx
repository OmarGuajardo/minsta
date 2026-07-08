"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function SessionIdLoginForm() {
  const router = useRouter();
  const [sessionid, setSessionid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionid }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Login failed.");
        return;
      }

      router.push("/profile");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-md border border-black/10 p-4 text-sm dark:border-white/15">
        <p className="font-medium">How to get your sessionid:</p>
        <ol className="list-decimal space-y-1 pl-4">
          <li>Log into instagram.com in your browser (normal login, handles 2FA fine).</li>
          <li>Open dev tools → Application (Chrome/Edge) or Storage (Firefox) → Cookies → instagram.com.</li>
          <li>
            Copy the value of the <code>sessionid</code> cookie.
          </li>
        </ol>
        <p className="text-black/60 dark:text-white/60">
          Treat this like a password — anyone with it can act as your account.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="sessionid" className="text-sm font-medium">
          sessionid
        </label>
        <input
          id="sessionid"
          name="sessionid"
          type="password"
          autoComplete="off"
          required
          value={sessionid}
          onChange={(e) => setSessionid(e.target.value)}
          className="rounded-md border border-black/10 px-3 py-2 outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/30"
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
      >
        {submitting ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
