import { LoginMethodSwitcher } from "@/components/LoginMethodSwitcher";

const REASON_MESSAGES: Record<string, string> = {
  required: "Please log in to continue.",
  expired: "Your Instagram session has expired — please log in again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const message = reason ? REASON_MESSAGES[reason] : undefined;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-2xl font-semibold">minsta</h1>
      {message && (
        <p className="w-full max-w-md rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          {message}
        </p>
      )}
      <LoginMethodSwitcher />
    </main>
  );
}
