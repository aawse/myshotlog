import { redirect } from "next/navigation";
import { configured, currentUser } from "@/lib/auth/server";
import { browserScope } from "@/lib/sync/server";
import { JournalProvider } from "@/components/journal-provider";
import { PrivateShell } from "@/components/private-shell";
export const dynamic = "force-dynamic";
export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!configured()) redirect("/setup/");
  const user = await currentUser();
  if (!user) redirect("/login/");
  const scope = browserScope(user.id);
  return (
    <JournalProvider key={scope} scope={scope}>
      <PrivateShell>{children}</PrivateShell>
    </JournalProvider>
  );
}
