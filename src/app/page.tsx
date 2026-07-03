import { redirect } from "next/navigation";
import { getSessionCookie } from "@/lib/session";

export default async function Home() {
  const sessionId = await getSessionCookie();
  redirect(sessionId ? "/profile" : "/login");
}
