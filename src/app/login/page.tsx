import { SessionIdLoginForm } from "@/components/SessionIdLoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-2xl font-semibold">minsta</h1>
      <SessionIdLoginForm />
    </main>
  );
}
