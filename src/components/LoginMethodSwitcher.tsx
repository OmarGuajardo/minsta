"use client";

import { useState } from "react";
import { SessionIdLoginForm } from "@/components/SessionIdLoginForm";
import { UsernamePasswordLoginForm } from "@/components/UsernamePasswordLoginForm";

type Method = "password" | "sessionid";

const METHODS: Array<{ key: Method; label: string }> = [
  { key: "password", label: "Username & password" },
  { key: "sessionid", label: "Session ID" },
];

export function LoginMethodSwitcher() {
  const [method, setMethod] = useState<Method>("password");

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex gap-2 rounded-md border border-black/10 p-1 dark:border-white/15">
        {METHODS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMethod(m.key)}
            className={
              m.key === method
                ? "flex-1 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
                : "flex-1 rounded-md px-3 py-1.5 text-sm text-black/60 dark:text-white/60"
            }
          >
            {m.label}
          </button>
        ))}
      </div>
      {method === "password" ? <UsernamePasswordLoginForm /> : <SessionIdLoginForm />}
    </div>
  );
}
