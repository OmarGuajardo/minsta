import { getAdminStatus, getRotationStatus } from "@/lib/instagrapi";
import { catchAuthError, requireSessionId } from "@/lib/require-session";
import { AdminPollerControls } from "@/components/AdminPollerControls";
import { AdminSettingsForm } from "@/components/AdminSettingsForm";
import { FollowedAccountsTable } from "@/components/FollowedAccountsTable";

export default async function AdminPage() {
  const sessionId = await requireSessionId();

  const [status, { items: rotation }] = await Promise.all([
    getAdminStatus(),
    catchAuthError(() => getRotationStatus(sessionId)),
  ]);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 p-8">
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

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Followed accounts ({rotation.length})</h2>
        {rotation.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            No accounts tracked yet — hit Refresh on the feed to start the rotation.
          </p>
        ) : (
          <FollowedAccountsTable accounts={rotation} />
        )}
      </section>
    </main>
  );
}
