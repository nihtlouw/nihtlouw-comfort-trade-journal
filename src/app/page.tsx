import { PagesJournal } from "@/components/pages-journal";
import { AuthScreen } from "@/components/auth-screen";
import { JournalApp } from "@/components/journal-app";

export const dynamic = "force-dynamic";
export default async function HomePage({ searchParams }: { searchParams: Promise<{ local?: string }> }) {
  const params = await searchParams;
  // A no-database install remains useful and never attempts backend requests.
  if (!process.env.DATABASE_URL || params.local === "1") return <PagesJournal/>;
  const { auth } = await import("@/lib/auth");
  const { headers } = await import("next/headers");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return <AuthScreen allowSignUp={process.env.BLOOM_ALLOW_SIGNUP === "true"}/>;
  const { getPrivateJournal } = await import("@/lib/server-journal");
  const journal = await getPrivateJournal(session.user.id, session.user.name);
  return <JournalApp initialData={journal.data} initialRevision={journal.revision} storage="server" backupScope={`private:${session.user.id}`}/>;
}
