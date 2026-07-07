import { ConnectInstagramButton } from "@/components/ConnectInstagramButton";

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "You declined the Instagram authorization request.",
  invalid_state: "Login session expired or was tampered with — please try again.",
  oauth_failed: "Instagram rejected the login attempt — please try again.",
  not_authenticated: "Your Instagram session expired — please reconnect.",
  unknown: "Something went wrong connecting to Instagram — please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.unknown) : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-2xl font-semibold">minsta</h1>
      <div className="flex w-full max-w-sm flex-col gap-4">
        {errorMessage && <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>}
        <ConnectInstagramButton />
      </div>
    </main>
  );
}
