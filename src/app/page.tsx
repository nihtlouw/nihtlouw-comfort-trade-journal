import { PagesJournal } from "@/components/pages-journal";
import { AuthScreen } from "@/components/auth-screen";
import { JournalApp } from "@/components/journal-app";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ local?: string; auth?: string; mode?: string; billing?: string }>;
}) {
  const params = await searchParams;
  // Without DATABASE_URL or with ?local=1, Bloom runs 100% locally with zero backend requests.
  if (!process.env.DATABASE_URL || params.local === "1") return <PagesJournal />;

  const { auth } = await import("@/lib/auth");
  const { headers } = await import("next/headers");
  const { buildServerCloudContext } = await import("@/lib/server-billing");

  const session = await auth.api.getSession({ headers: await headers() });
  const cloudContext = await buildServerCloudContext(
    session?.user
      ? { id: session.user.id, name: session.user.name, email: session.user.email }
      : null,
  );
  const allowSignUp = process.env.BLOOM_ALLOW_SIGNUP === "true" || cloudContext.saasMode;

  if (!session) {
    // Explicit auth screen via ?auth=1, or legacy private self-hosted auth wall when SaaS mode is off
    const requireWall =
      params.auth === "1" ||
      (!cloudContext.saasMode && process.env.BLOOM_INSTANT_LOCAL !== "true");
    if (requireWall) {
      return (
        <AuthScreen
          allowSignUp={allowSignUp}
          googleEnabled={cloudContext.googleEnabled}
          initialMode={params.mode === "signup" ? "sign-up" : "sign-in"}
        />
      );
    }
    // Zero-friction SaaS entry: start immediately in Free Local Mode with Cloud Sync CTA in Settings
    return <PagesJournal cloudContext={cloudContext} />;
  }

  // Signed in, but on Free plan in SaaS mode: keep running 100% free local mode until Pro is active
  if (!cloudContext.subscription?.isPro) {
    return (
      <PagesJournal
        cloudContext={cloudContext}
        initialOpenCloud={params.billing === "success"}
      />
    );
  }

  const { getPrivateJournal } = await import("@/lib/server-journal");
  const journal = await getPrivateJournal(session.user.id, session.user.name);
  return (
    <JournalApp
      initialData={journal.data}
      initialRevision={journal.revision}
      storage="server"
      backupScope={`private:${session.user.id}`}
      cloudContext={cloudContext}
      initialBillingSuccess={params.billing === "success"}
    />
  );
}
