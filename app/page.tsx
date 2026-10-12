import { redirect } from "next/navigation";
import { configured, currentUser } from "@/lib/auth/server";
export const dynamic = "force-dynamic";
export default async function Home() {
  if (!configured()) redirect("/setup");
  const user = await currentUser();
  redirect(user ? "/dashboard" : "/login");
}
