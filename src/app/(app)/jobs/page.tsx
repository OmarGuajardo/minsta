import { getAdminStatus } from "@/lib/instagrapi";
import { requireSessionId } from "@/lib/require-session";
import { AdminPollerControls } from "@/components/AdminPollerControls";
import { AdminSettingsForm } from "@/components/AdminSettingsForm";

export default async function AdminPage() {
  await requireSessionId();

  const status = await getAdminStatus();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-8">
      <h1 className="text-2xl font-semibold">Jobs</h1>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Background poller</h2>
        <AdminPollerControls
          initial={{ poller: status.poller, last_run: status.last_run, upcoming: status.upcoming }}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Global settings</h2>
        <AdminSettingsForm initialSettings={status.settings} closeFriends={status.close_friends} />
      </section>
    </main>
  );
}
