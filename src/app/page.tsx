import { getJournalData } from "@/lib/journal";
import { JournalApp } from "@/components/journal-app";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await getJournalData();
  return <JournalApp initialData={data} />;
}
