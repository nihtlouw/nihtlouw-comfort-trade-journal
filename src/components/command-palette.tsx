"use client";

import { useId, useMemo, useState, type ElementType } from "react";
import {
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  ClipboardList,
  CloudDownload,
  Disc3,
  Eye,
  EyeOff,
  Globe,
  Heart,
  Hourglass,
  ImageDown,
  LayoutDashboard,
  Moon,
  NotebookPen,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Sun,
  Target,
  Wind,
  X,
} from "lucide-react";
import { currency, formatRMultiple, shortDate, tradeRMultiple } from "@/lib/format";
import { translateMarket, UI_COPY } from "@/lib/i18n";
import type { AppLocale, JournalSettings, Trade } from "@/lib/types";
import { ModalShell } from "@/components/journal-dialogs";
import type { View } from "@/components/journal-views";

type CommandItem = {
  id: string;
  section: "actions" | "views" | "trades";
  title: string;
  subtitle?: string;
  badge?: string;
  keywords: string;
  icon: ElementType;
  run: () => void;
};

export function CommandPaletteModal({
  trades,
  settings,
  hidden,
  zenMode,
  locale = "en",
  onClose,
  onNavigate,
  onNewTrade,
  onOpenRecap,
  onToggleZen,
  onOpenBreathing,
  onOpenCassette,
  onPlaySoftRain,
  onTogglePrivacy,
  onToggleTheme,
  onToggleLocale,
  onDownloadBackup,
  onOpenSettings,
  onEditTrade,
}: {
  trades: Trade[];
  settings: JournalSettings;
  hidden: boolean;
  zenMode: boolean;
  locale?: AppLocale;
  onClose: () => void;
  onNavigate: (view: View) => void;
  onNewTrade: () => void;
  onOpenRecap: () => void;
  onToggleZen: () => void;
  onOpenBreathing: () => void;
  onOpenCassette: () => void;
  onPlaySoftRain: () => void;
  onTogglePrivacy: () => void;
  onToggleTheme: () => void;
  onToggleLocale: () => void;
  onDownloadBackup: () => void;
  onOpenSettings: () => void;
  onEditTrade: (trade: Trade) => void;
}) {
  const copy = UI_COPY[locale];
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const isDark = (settings.theme ?? "light") === "dark";

  const allItems = useMemo<CommandItem[]>(() => {
    const actions: CommandItem[] = [
      {
        id: "act-new-trade",
        section: "actions",
        title: copy.cmdActionNewTrade,
        keywords: "new add log trade catat baru entry",
        icon: Plus,
        run: () => onNewTrade(),
      },
      {
        id: "act-zen",
        section: "actions",
        title: zenMode ? copy.cmdActionZenOff : copy.cmdActionZenOn,
        keywords: "zen focus distraction free review fokus tenang",
        icon: Sparkles,
        run: () => {
          onClose();
          onToggleZen();
        },
      },
      {
        id: "act-recap",
        section: "actions",
        title: copy.cmdActionRecap,
        keywords: "recap png share export card image kartu rekap gambar",
        icon: ImageDown,
        run: () => onOpenRecap(),
      },
      {
        id: "act-rain",
        section: "actions",
        title: copy.cmdActionSoftRain,
        keywords: "rain ambient sound audio lofi hujan kaset",
        icon: Disc3,
        run: () => {
          onClose();
          onPlaySoftRain();
        },
      },
      {
        id: "act-cassette",
        section: "actions",
        title: copy.cmdActionCassette,
        keywords: "cassette music player tape ambient lagu musik",
        icon: Disc3,
        run: () => onOpenCassette(),
      },
      {
        id: "act-breath",
        section: "actions",
        title: copy.cmdActionBreath,
        keywords: "breath calm reset pause napas tenang",
        icon: Wind,
        run: () => onOpenBreathing(),
      },
      {
        id: "act-privacy",
        section: "actions",
        title: hidden ? copy.cmdActionPrivacyOff : copy.cmdActionPrivacyOn,
        keywords: "privacy hide show amounts dollar mask sembunyikan nominal",
        icon: hidden ? Eye : EyeOff,
        run: () => {
          onClose();
          onTogglePrivacy();
        },
      },
      {
        id: "act-theme",
        section: "actions",
        title: isDark ? copy.cmdActionThemeLight : copy.cmdActionThemeDark,
        keywords: "theme dark light espresso sage mode gelap terang",
        icon: isDark ? Sun : Moon,
        run: () => {
          onClose();
          onToggleTheme();
        },
      },
      {
        id: "act-lang",
        section: "actions",
        title: locale === "en" ? copy.cmdActionLangId : copy.cmdActionLangEn,
        keywords: "language english indonesia bahasa en id",
        icon: Globe,
        run: () => {
          onClose();
          onToggleLocale();
        },
      },
      {
        id: "act-backup",
        section: "actions",
        title: copy.cmdActionBackup,
        keywords: "backup export json download cadangan unduh",
        icon: CloudDownload,
        run: () => {
          onClose();
          onDownloadBackup();
        },
      },
    ];

    const viewDefs: { view: View; icon: ElementType; extra: string }[] = [
      { view: "Overview", icon: LayoutDashboard, extra: "home dashboard ringkasan" },
      { view: "Trade journal", icon: NotebookPen, extra: "journal table chartbook gallery jurnal tabel" },
      { view: "Analytics", icon: BarChart3, extra: "analytics matrix good loss bad win breakdown analitik" },
      { view: "Weekly review", icon: ClipboardList, extra: "weekly review evaluasi mingguan" },
      { view: "Calendar", icon: CalendarDays, extra: "calendar rest day session note kalender" },
      { view: "Playbook", icon: BookOpenCheck, extra: "playbook rules setup blueprints cetak biru" },
      { view: "Mindset", icon: Heart, extra: "mindset mood reflection refleksi" },
      { view: "Patience", icon: Hourglass, extra: "patience overtrade giveback sabar" },
      { view: "Goals", icon: Target, extra: "goals intentions habit target kebiasaan" },
    ];

    const views: CommandItem[] = [
      ...viewDefs.map(({ view, icon, extra }) => ({
        id: `view-${view}`,
        section: "views" as const,
        title: copy.views[view].nav,
        subtitle: copy.views[view].subtitle,
        keywords: `${view} ${copy.views[view].nav} ${extra}`.toLowerCase(),
        icon,
        run: () => {
          onClose();
          onNavigate(view);
        },
      })),
      {
        id: "view-settings",
        section: "views",
        title: copy.settings,
        keywords: "settings accounts risk data backup pengaturan akun",
        icon: Settings2,
        run: () => onOpenSettings(),
      },
    ];

    const q = query.trim().toLowerCase();
    const matchedTrades = (
      q
        ? trades.filter((t) =>
            `${t.symbol} ${t.setup} ${t.market} ${(t.tags ?? []).map((tag) => `#${tag}`).join(" ")} ${t.notes}`
              .toLowerCase()
              .includes(q),
          )
        : trades
    ).slice(0, q ? 8 : 4);

    const tradeItems: CommandItem[] = matchedTrades.map((t) => {
      const pnl = Number(t.pnl);
      const rVal = tradeRMultiple(t);
      const badge = `${currency(pnl, pnl > 0, hidden)}${rVal !== null ? ` · ${formatRMultiple(rVal)}` : ""}`;
      return {
        id: `trade-${t.id}`,
        section: "trades",
        title: `${t.symbol}${t.setup ? ` · ${t.setup}` : ""}`,
        subtitle: `${shortDate(t.tradeDate, true, locale)} · ${translateMarket(t.market, locale)}`,
        badge,
        keywords: `${t.symbol} ${t.setup} ${t.market} ${(t.tags ?? []).join(" ")}`.toLowerCase(),
        icon: NotebookPen,
        run: () => onEditTrade(t),
      };
    });

    if (!q) {
      return [...actions.slice(0, 6), ...views, ...tradeItems];
    }

    const matchesQuery = (item: CommandItem) =>
      `${item.title} ${item.subtitle ?? ""} ${item.keywords}`.toLowerCase().includes(q);

    return [
      ...actions.filter(matchesQuery),
      ...views.filter(matchesQuery),
      ...tradeItems,
    ];
  }, [
    copy,
    hidden,
    isDark,
    locale,
    onClose,
    onDownloadBackup,
    onEditTrade,
    onNavigate,
    onNewTrade,
    onOpenBreathing,
    onOpenCassette,
    onOpenRecap,
    onOpenSettings,
    onPlaySoftRain,
    onToggleLocale,
    onTogglePrivacy,
    onToggleTheme,
    onToggleZen,
    query,
    trades,
    zenMode,
  ]);

  const safeIndex = allItems.length ? Math.min(activeIndex, allItems.length - 1) : 0;

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!allItems.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % allItems.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev - 1 + allItems.length) % allItems.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      allItems[safeIndex]?.run();
    }
  }

  const sections: { key: CommandItem["section"]; label: string }[] = [
    { key: "actions", label: copy.cmdGroupActions },
    { key: "views", label: copy.cmdGroupViews },
    { key: "trades", label: copy.cmdGroupTrades },
  ];

  return (
    <ModalShell onClose={onClose} label={titleId}>
      <h2 id={titleId} className="sr-only">
        {copy.cmdModalTitle}
      </h2>

      <div className="cmd-palette" onKeyDown={handleKeyDown}>
        <div className="cmd-search-bar">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder={copy.cmdSearchPlaceholder}
            aria-label={copy.cmdModalTitle}
          />
          <button type="button" className="icon-button modal-close" onClick={onClose} aria-label={copy.close}>
            <X size={18} />
          </button>
        </div>

        <div className="cmd-results" role="listbox" aria-label={copy.cmdModalTitle}>
          {allItems.length === 0 ? (
            <div className="cmd-empty">{copy.cmdNoResults}</div>
          ) : (
            sections.map(({ key, label }) => {
              const groupItems = allItems.filter((item) => item.section === key);
              if (!groupItems.length) return null;
              return (
                <div className="cmd-group" key={key}>
                  <span className="cmd-group-label">{label}</span>
                  {groupItems.map((item) => {
                    const globalIdx = allItems.indexOf(item);
                    const isSelected = globalIdx === safeIndex;
                    const Icon = item.icon;
                    return (
                      <button
                        type="button"
                        key={item.id}
                        role="option"
                        aria-selected={isSelected}
                        className={`cmd-item ${isSelected ? "selected" : ""}`}
                        onMouseEnter={() => setActiveIndex(globalIdx)}
                        onClick={item.run}
                      >
                        <span className="cmd-item-icon" aria-hidden="true">
                          <Icon size={15} />
                        </span>
                        <span className="cmd-item-copy">
                          <strong>{item.title}</strong>
                          {item.subtitle && <small>{item.subtitle}</small>}
                        </span>
                        {item.badge && <span className="cmd-item-badge">{item.badge}</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        <div className="cmd-footer">
          <span>{copy.cmdHintFooter}</span>
          <kbd>Ctrl / ⌘ + K</kbd>
        </div>
      </div>
    </ModalShell>
  );
}
