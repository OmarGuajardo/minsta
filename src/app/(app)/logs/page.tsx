import { getRequestLog } from "@/lib/instagrapi";
import { requireSessionId } from "@/lib/require-session";
import { RequestLogTable } from "@/components/RequestLogTable";

export default async function LogsPage() {
  await requireSessionId();
  const { items } = await getRequestLog();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-8">
      <h1 className="text-2xl font-semibold">Logs</h1>
      <p className="text-sm text-black/70 dark:text-white/70">
        Every real Instagram request minsta has made (up to the most recent 2000), most recent first — what it was,
        and when.
      </p>
      <RequestLogTable initialItems={items} />
    </main>
  );
}
