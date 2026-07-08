import { redirect } from "next/navigation";
import { getSessionCookie } from "@/lib/session";
import { CreatePostForm } from "@/components/CreatePostForm";

export default async function NewPostPage() {
  const accessToken = await getSessionCookie();
  if (!accessToken) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-2xl font-semibold">New post</h1>
      <CreatePostForm />
    </main>
  );
}
