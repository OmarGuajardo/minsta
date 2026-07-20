import Link from "next/link";
import { getAdminStatus } from "@/lib/instagrapi";
import { requireSessionId } from "@/lib/require-session";
import { AdminPollerControls } from "@/components/AdminPollerControls";
import { AdminSettingsForm } from "@/components/AdminSettingsForm";

export default async function AdminPage() {
  await requireSessionId();

  const status = await getAdminStatus();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <div className="flex items-center gap-2">
          <Link href="/feed" className="rounded-md border border-black/10 px-3 py-1.5 text-sm dark:border-white/15">
            Feed
          </Link>
          <Link href="/health" className="rounded-md border border-black/10 px-3 py-1.5 text-sm dark:border-white/15">
            Health
          </Link>
        </div>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Background poller</h2>
        <AdminPollerControls initialPoller={status.poller} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Global settings</h2>
        <AdminSettingsForm initialSettings={status.settings} />
      </section>
    </main>
  );
}
