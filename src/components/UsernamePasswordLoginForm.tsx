"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function UsernamePasswordLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
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
        body: JSON.stringify({ username, password, verificationCode: verificationCode || undefined }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.code === "verification_required") {
          setNeedsVerification(true);
          setError(null);
          return;
        }
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
      <div className="flex flex-col gap-1">
        <label htmlFor="username" className="text-sm font-medium">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          disabled={needsVerification}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="rounded-md border border-black/10 px-3 py-2 outline-none focus:border-black/30 disabled:opacity-50 dark:border-white/15 dark:focus:border-white/30"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={needsVerification}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-black/10 px-3 py-2 outline-none focus:border-black/30 disabled:opacity-50 dark:border-white/15 dark:focus:border-white/30"
        />
      </div>

      {needsVerification && (
        <div className="flex flex-col gap-1">
          <label htmlFor="verificationCode" className="text-sm font-medium">
            2FA code
          </label>
          <input
            id="verificationCode"
            name="verificationCode"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value)}
            className="rounded-md border border-black/10 px-3 py-2 outline-none focus:border-black/30 dark:border-white/15 dark:focus:border-white/30"
          />
          <p className="text-xs text-black/60 dark:text-white/60">
            Instagram is asking for a two-factor code. Enter it and submit again.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
      >
        {submitting ? "Logging in…" : needsVerification ? "Submit code" : "Log in"}
      </button>
    </form>
  );
}
