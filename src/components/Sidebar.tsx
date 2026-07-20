"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRequestBudget } from "@/hooks/useRequestBudget";
import { CircularGauge } from "@/components/CircularGauge";

const NAV_ITEMS = [
  { href: "/feed", label: "Feed" },
  { href: "/profile", label: "Profile" },
  { href: "/health", label: "Health" },
  { href: "/admin", label: "Admin" },
];

export function Sidebar() {
  const pathname = usePathname();
  const budget = useRequestBudget();

  return (
    <nav className="flex w-40 shrink-0 flex-col gap-1 border-r border-black/10 p-4 dark:border-white/15">
      <span className="mb-2 px-3 text-lg font-semibold">minsta</span>
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              isActive
                ? "rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background"
                : "rounded-md px-3 py-2 text-sm text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/10"
            }
          >
            {item.label}
          </Link>
        );
      })}

      {budget && (
        <div className="mt-4 flex flex-col items-center gap-3 border-t border-black/10 pt-4 dark:border-white/15">
          <CircularGauge label="Hour" used={budget.hour.used} limit={budget.hour.limit} />
          <CircularGauge label="Day" used={budget.day.used} limit={budget.day.limit} />
        </div>
      )}
    </nav>
  );
}
