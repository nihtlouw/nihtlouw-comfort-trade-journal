import { getAttachment, saveAttachment } from "@/lib/attachments";
import { inspectBrowserJournal } from "@/lib/browser-journal";
import { createDemoData } from "@/lib/demo-data";
import { normalizeJournalData } from "@/lib/journal-data";
import { getStrategyPdf, saveStrategyPdf } from "@/lib/strategy-library";
import {
  DEFAULT_ACCOUNT,
  type JournalData,
  type StrategyLibraryItem,
  type Trade,
  type TradeAttachment,
  type TradingAccount,
} from "@/lib/types";

function tradeSignature(trade: Trade): string {
  return [
    trade.symbol.trim().toUpperCase(),
    trade.tradeDate,
    trade.side,
    Number(trade.pnl).toFixed(2),
    (trade.setup ?? "").trim().toLowerCase(),
  ].join("|");
}

/**
 * Non-destructively merges a trader's local browser journal into their Cloud Sync
 * journal when upgrading from Free Local Mode to Pro Cloud Sync.
 */
export function mergeLocalIntoCloudJournal(
  localRaw: JournalData,
  cloudRaw: JournalData,
): { merged: JournalData; addedTrades: number; addedAccounts: number } {
  const local = normalizeJournalData(localRaw);
  const cloud = normalizeJournalData(cloudRaw);

  // 1. Merge trading accounts (match by ID or case-insensitive name)
  const cloudAccounts: TradingAccount[] = [...(cloud.settings.accounts ?? [DEFAULT_ACCOUNT])];
  const accountIdRemap = new Map<string, string>();
  let addedAccounts = 0;

  for (const localAcc of local.settings.accounts ?? []) {
    const existing = cloudAccounts.find(
      (acc) =>
        acc.id === localAcc.id ||
        acc.name.trim().toLowerCase() === localAcc.name.trim().toLowerCase(),
    );
    if (existing) {
      accountIdRemap.set(localAcc.id, existing.id);
      if (
        (existing.startingBalance === null || existing.startingBalance === undefined) &&
        typeof localAcc.startingBalance === "number"
      ) {
        existing.startingBalance = localAcc.startingBalance;
      }
    } else if (cloudAccounts.length < 12) {
      cloudAccounts.push({ ...localAcc });
      accountIdRemap.set(localAcc.id, localAcc.id);
      addedAccounts++;
    }
  }

  // 2. Merge trades (skip demo sample trades if real trades exist, deduplicate by signature)
  const cloudHasRealTrades = cloud.trades.some((t) => !t.isDemo);
  const localRealTrades = local.trades.filter((t) => !t.isDemo);
  const candidateLocalTrades =
    localRealTrades.length > 0 || cloudHasRealTrades ? localRealTrades : local.trades;

  const existingSigs = new Set(cloud.trades.map(tradeSignature));
  let nextId = Math.max(0, ...cloud.trades.map((t) => t.id));
  const mergedTrades: Trade[] = [
    ...(localRealTrades.length > 0 ? cloud.trades.filter((t) => !t.isDemo) : cloud.trades),
  ];
  let addedTrades = 0;

  for (const localTrade of candidateLocalTrades) {
    const remappedAccountId =
      accountIdRemap.get(localTrade.accountId ?? DEFAULT_ACCOUNT.id) ??
      localTrade.accountId ??
      DEFAULT_ACCOUNT.id;
    const candidate: Trade = { ...localTrade, accountId: remappedAccountId };
    const sig = tradeSignature(candidate);
    if (existingSigs.has(sig)) continue;
    nextId += 1;
    mergedTrades.push({ ...candidate, id: nextId });
    existingSigs.add(sig);
    addedTrades += 1;
  }

  mergedTrades.sort((a, b) => b.tradeDate.localeCompare(a.tradeDate) || b.id - a.id);

  // 3. Merge playbook rules, setup blueprints, day journals, reflections, goals, youtube & strategy shelf
  const mergedPlaybook = [...cloud.settings.playbook];
  const ruleNorms = new Set(mergedPlaybook.map((r) => `${r.group}:${r.text.trim().toLowerCase()}`));
  for (const rule of local.settings.playbook) {
    const key = `${rule.group}:${rule.text.trim().toLowerCase()}`;
    if (!ruleNorms.has(key) && mergedPlaybook.length < 60) {
      mergedPlaybook.push({ ...rule });
      ruleNorms.add(key);
    }
  }

  const mergedBlueprints = [...(cloud.settings.setupBlueprints ?? [])];
  const bpNames = new Set(mergedBlueprints.map((bp) => bp.name.trim().toLowerCase()));
  for (const bp of local.settings.setupBlueprints ?? []) {
    const norm = bp.name.trim().toLowerCase();
    if (!bpNames.has(norm) && mergedBlueprints.length < 30) {
      mergedBlueprints.push({ ...bp });
      bpNames.add(norm);
    }
  }

  const dayMap = new Map((cloud.settings.dayJournals ?? []).map((d) => [d.date, d]));
  for (const d of local.settings.dayJournals ?? []) {
    if (!dayMap.has(d.date)) dayMap.set(d.date, d);
  }

  const moodMap = new Map((cloud.settings.moodHistory ?? []).map((m) => [m.date, m]));
  for (const m of local.settings.moodHistory ?? []) {
    if (!moodMap.has(m.date)) moodMap.set(m.date, m);
  }

  const mergedReflections = [...(cloud.settings.reflections ?? [])];
  const refSigs = new Set(mergedReflections.map((r) => `${r.date}|${r.wentWell.trim()}`));
  for (const r of local.settings.reflections ?? []) {
    const sig = `${r.date}|${r.wentWell.trim()}`;
    if (!refSigs.has(sig)) {
      mergedReflections.push(r);
      refSigs.add(sig);
    }
  }

  const mergedGoals = [...(cloud.settings.goals ?? [])];
  const goalNorms = new Set(mergedGoals.map((g) => g.text.trim().toLowerCase()));
  for (const g of local.settings.goals ?? []) {
    const norm = g.text.trim().toLowerCase();
    if (!goalNorms.has(norm) && mergedGoals.length < 25) {
      mergedGoals.push(g);
      goalNorms.add(norm);
    }
  }

  const mergedYoutube = [...(cloud.settings.youtubeLinks ?? [])];
  const ytIds = new Set(mergedYoutube.map((v) => v.videoId));
  for (const v of local.settings.youtubeLinks ?? []) {
    if (!ytIds.has(v.videoId) && mergedYoutube.length < 30) {
      mergedYoutube.push(v);
      ytIds.add(v.videoId);
    }
  }

  const mergedLibrary: StrategyLibraryItem[] = [...(cloud.settings.strategyLibrary ?? [])];
  const libKeys = new Set(
    mergedLibrary.map((item) =>
      item.kind === "link" ? `link:${item.url}` : `pdf:${item.title.toLowerCase()}`,
    ),
  );
  for (const item of local.settings.strategyLibrary ?? []) {
    const key = item.kind === "link" ? `link:${item.url}` : `pdf:${item.title.toLowerCase()}`;
    if (!libKeys.has(key) && mergedLibrary.length < 25) {
      mergedLibrary.push(item);
      libKeys.add(key);
    }
  }

  const preferName =
    cloud.settings.name && cloud.settings.name !== "friend"
      ? cloud.settings.name
      : local.settings.name;

  const merged: JournalData = normalizeJournalData({
    trades: mergedTrades,
    settings: {
      ...cloud.settings,
      name: preferName,
      theme: local.settings.theme ?? cloud.settings.theme,
      darkVariant: local.settings.darkVariant ?? cloud.settings.darkVariant,
      locale: local.settings.locale ?? cloud.settings.locale,
      patienceLocale: local.settings.patienceLocale ?? cloud.settings.patienceLocale,
      accounts: cloudAccounts,
      playbook: mergedPlaybook,
      setupBlueprints: mergedBlueprints,
      dayJournals: [...dayMap.values()].sort((a, b) => b.date.localeCompare(a.date)),
      moodHistory: [...moodMap.values()].sort((a, b) => b.date.localeCompare(a.date)),
      reflections: mergedReflections,
      goals: mergedGoals,
      youtubeLinks: mergedYoutube,
      strategyLibrary: mergedLibrary,
    },
  });

  return { merged, addedTrades, addedAccounts };
}

export type LocalDeviceSummary = {
  realTradeCount: number;
  hasLocalData: boolean;
};

export function getLocalDeviceSummary(): LocalDeviceSummary {
  if (typeof window === "undefined") return { realTradeCount: 0, hasLocalData: false };
  try {
    const inspected = inspectBrowserJournal(window.localStorage, createDemoData());
    const realTradeCount = inspected.data.trades.filter((t) => !t.isDemo).length;
    const bpCount = inspected.data.settings.setupBlueprints?.length ?? 0;
    const dayCount = inspected.data.settings.dayJournals?.length ?? 0;
    return {
      realTradeCount,
      hasLocalData: realTradeCount > 0 || bpCount > 0 || dayCount > 0,
    };
  } catch {
    return { realTradeCount: 0, hasLocalData: false };
  }
}

/**
 * Uploads local IndexedDB screenshots & strategy PDFs to Cloud Storage and merges
 * the local browser journal into the authenticated Pro Cloud journal.
 */
export async function syncLocalDeviceJournalToCloud(): Promise<{
  addedTrades: number;
  uploadedImages: number;
  uploadedPdfs: number;
  mergedData: JournalData;
  revision: number;
}> {
  const inspected = inspectBrowserJournal(window.localStorage, createDemoData());
  const localCopy: JournalData = structuredClone(inspected.data);

  let uploadedImages = 0;
  for (const trade of localCopy.trades) {
    if (trade.isDemo || !trade.attachments?.length) continue;
    const nextAttachments: TradeAttachment[] = [];
    for (const att of trade.attachments) {
      try {
        const blob = await getAttachment(att, "browser");
        const uploaded = await saveAttachment(blob, att.name, "server");
        nextAttachments.push({
          ...uploaded,
          ...(att.stage ? { stage: att.stage } : {}),
          ...(att.caption ? { caption: att.caption } : {}),
        });
        uploadedImages += 1;
      } catch {
        // Skip missing local blobs rather than aborting the whole migration
      }
    }
    trade.attachments = nextAttachments;
  }

  let uploadedPdfs = 0;
  const nextLib: StrategyLibraryItem[] = [];
  for (const item of localCopy.settings.strategyLibrary ?? []) {
    if (item.kind === "link") {
      nextLib.push(item);
      continue;
    }
    try {
      const pdfBlob = await getStrategyPdf(item.fileId, item.fileName, "browser");
      const saved = await saveStrategyPdf(pdfBlob, item.fileName, "server");
      nextLib.push({
        ...item,
        fileId: saved.fileId,
        fileName: saved.fileName,
        size: saved.size,
      });
      uploadedPdfs += 1;
    } catch {
      // Skip missing local PDFs gracefully
    }
  }
  localCopy.settings.strategyLibrary = nextLib;

  const currentResp = await fetch("/api/journal", { cache: "no-store" });
  if (!currentResp.ok) {
    throw new Error("Please sign in to an active Cloud Sync Pro account first.");
  }
  const currentCloud = (await currentResp.json()) as { data: JournalData; revision: number };
  const { merged, addedTrades } = mergeLocalIntoCloudJournal(localCopy, currentCloud.data);

  const saveResp = await fetch("/api/journal", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision: currentCloud.revision, data: merged }),
  });
  const saveBody = (await saveResp.json().catch(() => ({}))) as { revision?: number; error?: string };
  if (!saveResp.ok || typeof saveBody.revision !== "number") {
    throw new Error(saveBody.error || "Couldn't save merged journal to Cloud.");
  }

  return {
    addedTrades,
    uploadedImages,
    uploadedPdfs,
    mergedData: merged,
    revision: saveBody.revision,
  };
}
