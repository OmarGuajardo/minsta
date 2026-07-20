import { requireSessionId } from "@/lib/require-session";
import { CreatePostForm } from "@/components/CreatePostForm";

export default async function NewPostPage() {
  await requireSessionId();

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-2xl font-semibold">New post</h1>
      <CreatePostForm />
    </main>
  );
}
