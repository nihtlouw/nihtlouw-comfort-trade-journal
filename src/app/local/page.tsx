import { PagesJournal } from "@/components/pages-journal";

/** This route is intentionally generic: it never reads a server session or account. */
export default function LocalJournalPage() { return <PagesJournal/>; }
