import type {
  AppLocale,
  AttachmentStage,
  DayJournalEntry,
  Intention,
  JournalData,
  MoodEntry,
  PlaybookRule,
  RuleSnapshot,
  SavedYoutubeVideo,
  SetupBlueprint,
  StrategyLibraryItem,
  Trade,
  TradingAccount,
  WalkAwayLog,
  WeeklyReflection,
} from "@/lib/types";

function offsetDateString(daysAgoCount: number, baseDate?: Date): string {
  const d = baseDate ? new Date(baseDate.getTime()) : new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - daysAgoCount);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type SeedSpec = {
  daysAgo: number;
  accountId: "main" | "swing";
  symbol: string;
  market: Trade["market"];
  side: Trade["side"];
  setup: string;
  session: string;
  timeframe: string;
  entryPrice: string;
  exitPrice: string;
  stopLoss: string;
  takeProfit: string;
  positionSize: string;
  initialRisk: string;
  fees: string;
  pnl: string;
  followedPlan: boolean | null;
  checkedCount: number;
  mood: "Calm" | "Focused" | "Anxious" | "Tired";
  tags: string[];
  noteEn: string;
  noteId: string;
};

const SEED_TRADES: SeedSpec[] = [
  // ===================== MONTH -2 (Days 88 .. 61 ago) =====================
  {
    daysAgo: 88, accountId: "main", symbol: "EUR/USD", market: "Forex", side: "Long",
    setup: "London Liquidity Sweep", session: "London", timeframe: "M15",
    entryPrice: "1.0842", exitPrice: "1.0878", stopLoss: "1.0827", takeProfit: "1.0880",
    positionSize: "1.00", initialRisk: "120.00", fees: "4.00", pnl: "236.00",
    followedPlan: true, checkedCount: 6, mood: "Calm", tags: ["A+", "HTF Aligned"],
    noteEn: "Clean sweep below Asian low followed by M15 displacement candle. Held calmly to target.",
    noteId: "Sweep bersih di bawah low sesi Asia diikuti candle displacement M15. Tahan tenang sampai target.",
  },
  {
    daysAgo: 86, accountId: "swing", symbol: "BTC/USD", market: "Crypto", side: "Long",
    setup: "Trend Continuation", session: "Asia", timeframe: "H4",
    entryPrice: "61250.00", exitPrice: "62980.00", stopLoss: "60400.00", takeProfit: "63200.00",
    positionSize: "0.15", initialRisk: "127.50", fees: "6.50", pnl: "253.00",
    followedPlan: true, checkedCount: 7, mood: "Focused", tags: ["patient", "HTF Aligned"],
    noteEn: "H4 higher-low retest into 21 EMA with rising spot volume.",
    noteId: "Retest higher-low H4 di area EMA 21 dengan volume spot meningkat.",
  },
  {
    daysAgo: 84, accountId: "main", symbol: "XAU/USD", market: "Commodities", side: "Short",
    setup: "HTF Support Bounce", session: "New York", timeframe: "H1",
    entryPrice: "2388.50", exitPrice: "2395.00", stopLoss: "2395.00", takeProfit: "2372.00",
    positionSize: "0.20", initialRisk: "130.00", fees: "3.00", pnl: "-133.00",
    followedPlan: true, checkedCount: 6, mood: "Calm", tags: ["Good Loss", "Plan Followed"],
    noteEn: "Valid setup into H1 supply; US yields dipped unexpectedly and stopped me out cleanly at planned risk.",
    noteId: "Setup valid di supply H1; yield AS turun mendadak dan kena stop loss sesuai batas risiko rencana.",
  },
  {
    daysAgo: 81, accountId: "main", symbol: "NAS100", market: "Futures", side: "Long",
    setup: "ORB Pullback", session: "Overlap", timeframe: "M15",
    entryPrice: "19420.00", exitPrice: "19515.00", stopLoss: "19380.00", takeProfit: "19520.00",
    positionSize: "2.00", initialRisk: "140.00", fees: "5.00", pnl: "315.00",
    followedPlan: true, checkedCount: 7, mood: "Focused", tags: ["A+", "pullback"],
    noteEn: "Opening range breakout and textbook 50% pullback retest at 9:45 ET.",
    noteId: "Breakout opening range diikuti pullback rapi 50% pada pembukaan sesi NY.",
  },
  {
    daysAgo: 79, accountId: "swing", symbol: "NVDA", market: "Stocks", side: "Long",
    setup: "Trend Continuation", session: "New York", timeframe: "D1",
    entryPrice: "118.40", exitPrice: "124.10", stopLoss: "115.90", takeProfit: "125.00",
    positionSize: "40", initialRisk: "100.00", fees: "2.00", pnl: "226.00",
    followedPlan: true, checkedCount: 6, mood: "Calm", tags: ["HTF Aligned", "Swing"],
    noteEn: "Tight 3-day flag above 20-day moving average; scaled out into strength.",
    noteId: "Konsolidasi flag 3 hari di atas MA-20; ambil profit bertahap saat menguat.",
  },
  {
    daysAgo: 76, accountId: "main", symbol: "GBP/USD", market: "Forex", side: "Short",
    setup: "London Liquidity Sweep", session: "London", timeframe: "M15",
    entryPrice: "1.2765", exitPrice: "1.2728", stopLoss: "1.2782", takeProfit: "1.2725",
    positionSize: "0.80", initialRisk: "136.00", fees: "3.20", pnl: "292.80",
    followedPlan: true, checkedCount: 6, mood: "Focused", tags: ["A+", "London Killzone"],
    noteEn: "Swept Frankfurt high by 6 pips then broke market structure lower.",
    noteId: "Menyapu high Frankfurt sejauh 6 pip lalu patah struktur turun dengan rapi.",
  },
  {
    daysAgo: 74, accountId: "main", symbol: "USD/JPY", market: "Forex", side: "Long",
    setup: "Impulse Chase", session: "Asia", timeframe: "M15",
    entryPrice: "147.85", exitPrice: "148.05", stopLoss: "147.45", takeProfit: "148.40",
    positionSize: "0.60", initialRisk: "145.00", fees: "3.00", pnl: "78.00",
    followedPlan: false, checkedCount: 2, mood: "Anxious", tags: ["fomo", "early-exit"],
    noteEn: "Bad win: chased green Tokyo candle without waiting for pullback, closed early out of nerves.",
    noteId: "Menang kurang disiplin: kejar candle hijau sesi Tokyo tanpa tunggu retest, tutup terlalu cepat.",
  },
  {
    daysAgo: 71, accountId: "swing", symbol: "ETH/USD", market: "Crypto", side: "Long",
    setup: "HTF Support Bounce", session: "New York", timeframe: "H4",
    entryPrice: "2640.00", exitPrice: "2590.00", stopLoss: "2590.00", takeProfit: "2760.00",
    positionSize: "2.20", initialRisk: "110.00", fees: "4.40", pnl: "-114.40",
    followedPlan: true, checkedCount: 5, mood: "Calm", tags: ["Good Loss", "Plan Followed"],
    noteEn: "Respected invalidation level without moving stop loss.",
    noteId: "Disiplin menghormati level invalidasi tanpa menggeser stop loss.",
  },
  {
    daysAgo: 69, accountId: "main", symbol: "XAU/USD", market: "Commodities", side: "Long",
    setup: "HTF Support Bounce", session: "Overlap", timeframe: "H1",
    entryPrice: "2404.00", exitPrice: "2421.50", stopLoss: "2397.00", takeProfit: "2422.00",
    positionSize: "0.20", initialRisk: "140.00", fees: "3.00", pnl: "347.00",
    followedPlan: true, checkedCount: 7, mood: "Focused", tags: ["A+", "patient"],
    noteEn: "Waited 90 minutes for gold to tap H1 demand block before entering.",
    noteId: "Sabar menunggu 90 menit hingga emas menyentuh zona demand H1 sebelum masuk.",
  },
  {
    daysAgo: 67, accountId: "main", symbol: "EUR/USD", market: "Forex", side: "Long",
    setup: "London Liquidity Sweep", session: "London", timeframe: "M15",
    entryPrice: "1.0910", exitPrice: "1.0910", stopLoss: "1.0895", takeProfit: "1.0940",
    positionSize: "0.80", initialRisk: "120.00", fees: "0.00", pnl: "0.00",
    followedPlan: true, checkedCount: 6, mood: "Calm", tags: ["Breakeven", "Risk Managed"],
    noteEn: "Moved stop to breakeven at +1R ahead of Eurozone speech; price retraced cleanly.",
    noteId: "Geser stop ke breakeven saat +1R menjelang rilis pidato Eropa; modal aman.",
  },
  {
    daysAgo: 66, accountId: "swing", symbol: "AAPL", market: "Stocks", side: "Long",
    setup: "ORB Pullback", session: "New York", timeframe: "H1",
    entryPrice: "221.50", exitPrice: "225.40", stopLoss: "219.80", takeProfit: "225.50",
    positionSize: "50", initialRisk: "85.00", fees: "2.00", pnl: "193.00",
    followedPlan: true, checkedCount: 6, mood: "Focused", tags: ["pullback", "HTF Aligned"],
    noteEn: "Clean post-earnings gap hold above VWAP.",
    noteId: "Bertahan rapi di atas VWAP setelah gap laporan keuangan.",
  },
  {
    daysAgo: 64, accountId: "main", symbol: "NAS100", market: "Futures", side: "Short",
    setup: "Impulse Chase", session: "New York", timeframe: "M15",
    entryPrice: "19680.00", exitPrice: "19745.00", stopLoss: "19745.00", takeProfit: "19550.00",
    positionSize: "2.00", initialRisk: "145.00", fees: "5.00", pnl: "-165.00",
    followedPlan: false, checkedCount: 1, mood: "Tired", tags: ["fomo", "Counter-Trend"],
    noteEn: "Shorted strong afternoon trend while tired. Clear reminder to stop after London-NY overlap.",
    noteId: "Melawan tren kuat sore hari saat lelah. Pengingat jelas untuk berhenti setelah sesi overlap.",
  },
  {
    daysAgo: 62, accountId: "main", symbol: "GBP/USD", market: "Forex", side: "Long",
    setup: "Trend Continuation", session: "London", timeframe: "H1",
    entryPrice: "1.2815", exitPrice: "1.2852", stopLoss: "1.2798", takeProfit: "1.2855",
    positionSize: "0.75", initialRisk: "127.50", fees: "3.00", pnl: "274.50",
    followedPlan: true, checkedCount: 6, mood: "Calm", tags: ["patient", "HTF Aligned"],
    noteEn: "Smooth London continuation in line with daily bullish structure.",
    noteId: "Kelanjutan tren sesi London searah struktur bullish harian.",
  },
  {
    daysAgo: 62, accountId: "swing", symbol: "SOL/USD", market: "Crypto", side: "Long",
    setup: "Trend Continuation", session: "New York", timeframe: "H4",
    entryPrice: "142.00", exitPrice: "149.50", stopLoss: "138.50", takeProfit: "150.00",
    positionSize: "25", initialRisk: "87.50", fees: "3.50", pnl: "184.00",
    followedPlan: null, checkedCount: 0, mood: "Focused", tags: ["Swing"],
    noteEn: "Quick swing continuation logged from mobile after H4 close.",
    noteId: "Posisi swing lanjutan dicatat setelah penutupan candle H4.",
  },

  // ===================== MONTH -1 (Days 60 .. 31 ago) =====================
  {
    daysAgo: 59, accountId: "main", symbol: "EUR/USD", market: "Forex", side: "Short",
    setup: "London Liquidity Sweep", session: "London", timeframe: "M15",
    entryPrice: "1.0964", exitPrice: "1.0930", stopLoss: "1.0980", takeProfit: "1.0928",
    positionSize: "0.80", initialRisk: "128.00", fees: "3.20", pnl: "268.80",
    followedPlan: true, checkedCount: 7, mood: "Focused", tags: ["A+", "London Killzone"],
    noteEn: "Textbook sweep of prior day high with bearish engulfing confirmation.",
    noteId: "Sweep high hari sebelumnya dengan konfirmasi bearish engulfing yang presisi.",
  },
  {
    daysAgo: 56, accountId: "swing", symbol: "BTC/USD", market: "Crypto", side: "Long",
    setup: "HTF Support Bounce", session: "Asia", timeframe: "H4",
    entryPrice: "60800.00", exitPrice: "62450.00", stopLoss: "59950.00", takeProfit: "62600.00",
    positionSize: "0.14", initialRisk: "119.00", fees: "5.60", pnl: "225.40",
    followedPlan: true, checkedCount: 6, mood: "Calm", tags: ["patient", "HTF Aligned"],
    noteEn: "Defended $60.8k weekly demand zone; zero heat after entry.",
    noteId: "Mempertahankan area demand mingguan $60.8k; pergerakan langsung searah.",
  },
  {
    daysAgo: 53, accountId: "main", symbol: "XAU/USD", market: "Commodities", side: "Long",
    setup: "ORB Pullback", session: "Overlap", timeframe: "M15",
    entryPrice: "2442.00", exitPrice: "2456.00", stopLoss: "2435.50", takeProfit: "2457.00",
    positionSize: "0.20", initialRisk: "130.00", fees: "3.00", pnl: "277.00",
    followedPlan: true, checkedCount: 6, mood: "Focused", tags: ["A+", "pullback"],
    noteEn: "NY open range breakout retest on gold with DXY weakness.",
    noteId: "Retest breakout pembukaan NY pada emas didukung pelemahan indeks DXY.",
  },
  {
    daysAgo: 50, accountId: "main", symbol: "NAS100", market: "Futures", side: "Long",
    setup: "ORB Pullback", session: "New York", timeframe: "M15",
    entryPrice: "19810.00", exitPrice: "19765.00", stopLoss: "19765.00", takeProfit: "19910.00",
    positionSize: "2.00", initialRisk: "120.00", fees: "5.00", pnl: "-125.00",
    followedPlan: true, checkedCount: 6, mood: "Calm", tags: ["Good Loss", "Plan Followed"],
    noteEn: "Setup met every rule; semiconductor rotation dragged index back into range.",
    noteId: "Setup memenuhi seluruh kriteria; rotasi sektor chip menarik indeks kembali ke range.",
  },
  {
    daysAgo: 47, accountId: "swing", symbol: "MSFT", market: "Stocks", side: "Long",
    setup: "Trend Continuation", session: "New York", timeframe: "D1",
    entryPrice: "418.00", exitPrice: "426.80", stopLoss: "414.00", takeProfit: "428.00",
    positionSize: "25", initialRisk: "100.00", fees: "2.00", pnl: "218.00",
    followedPlan: true, checkedCount: 5, mood: "Calm", tags: ["HTF Aligned", "Swing"],
    noteEn: "Steady institutional trend above 50 EMA.",
    noteId: "Tren institusional stabil di atas EMA 50 harian.",
  },
  {
    daysAgo: 44, accountId: "main", symbol: "EUR/USD", market: "Forex", side: "Long",
    setup: "London Liquidity Sweep", session: "London", timeframe: "M15",
    entryPrice: "1.1012", exitPrice: "1.1045", stopLoss: "1.0997", takeProfit: "1.1048",
    positionSize: "0.80", initialRisk: "120.00", fees: "3.20", pnl: "260.80",
    followedPlan: true, checkedCount: 7, mood: "Focused", tags: ["A+", "patient"],
    noteEn: "Waited for London 08:30 liquidity raid before triggering long.",
    noteId: "Menunggu sapuan likuiditas pukul 08:30 London sebelum eksekusi beli.",
  },
  {
    daysAgo: 44, accountId: "swing", symbol: "ETH/USD", market: "Crypto", side: "Long",
    setup: "Trend Continuation", session: "Overlap", timeframe: "H1",
    entryPrice: "2710.00", exitPrice: "2765.00", stopLoss: "2680.00", takeProfit: "2770.00",
    positionSize: "3.00", initialRisk: "90.00", fees: "4.00", pnl: "161.00",
    followedPlan: true, checkedCount: 6, mood: "Focused", tags: ["pullback"],
    noteEn: "Second trade of the day on separate swing account; clean H1 flag breakout.",
    noteId: "Trade kedua hari ini di akun swing terpisah; breakout flag H1 rapi.",
  },
  {
    daysAgo: 41, accountId: "main", symbol: "USD/JPY", market: "Forex", side: "Short",
    setup: "HTF Support Bounce", session: "Asia", timeframe: "H1",
    entryPrice: "145.20", exitPrice: "144.65", stopLoss: "145.50", takeProfit: "144.60",
    positionSize: "0.60", initialRisk: "124.00", fees: "3.00", pnl: "225.00",
    followedPlan: true, checkedCount: 6, mood: "Calm", tags: ["HTF Aligned"],
    noteEn: "Rejected H4 resistance cleanly during Tokyo session.",
    noteId: "Menolak area resistance H4 dengan rapi pada sesi Tokyo.",
  },
  // Intentional Overtrade + Green-to-Red Giveback Day (4 trades on daysAgo 38 -> +260 then -140, -120, -95 = -95 net)
  {
    daysAgo: 38, accountId: "main", symbol: "XAU/USD", market: "Commodities", side: "Long",
    setup: "London Liquidity Sweep", session: "London", timeframe: "M15",
    entryPrice: "2470.00", exitPrice: "2483.20", stopLoss: "2464.00", takeProfit: "2484.00",
    positionSize: "0.20", initialRisk: "120.00", fees: "3.00", pnl: "260.00",
    followedPlan: true, checkedCount: 6, mood: "Focused", tags: ["A+"],
    noteEn: "Great morning trade (+2.1R). Should have locked the session right here.",
    noteId: "Trade pagi sangat bagus (+2.1R). Seharusnya sesi langsung dikunci di sini.",
  },
  {
    daysAgo: 38, accountId: "main", symbol: "NAS100", market: "Futures", side: "Long",
    setup: "Impulse Chase", session: "New York", timeframe: "M15",
    entryPrice: "19940.00", exitPrice: "19890.00", stopLoss: "19890.00", takeProfit: "20040.00",
    positionSize: "2.00", initialRisk: "140.00", fees: "5.00", pnl: "-140.00",
    followedPlan: false, checkedCount: 2, mood: "Anxious", tags: ["fomo", "revenge"],
    noteEn: "Overconfident after morning gold win and chased extended NY open candle.",
    noteId: "Terlalu percaya diri setelah menang emas pagi hari dan mengejar candle pembukaan NY.",
  },
  {
    daysAgo: 38, accountId: "main", symbol: "NAS100", market: "Futures", side: "Long",
    setup: "Impulse Chase", session: "New York", timeframe: "M15",
    entryPrice: "19885.00", exitPrice: "19842.00", stopLoss: "19842.00", takeProfit: "19980.00",
    positionSize: "2.00", initialRisk: "120.00", fees: "5.00", pnl: "-120.00",
    followedPlan: false, checkedCount: 1, mood: "Anxious", tags: ["fomo", "revenge"],
    noteEn: "Re-entered immediately trying to win back the first NY loss.",
    noteId: "Masuk ulang terlalu cepat karena ingin membalas kerugian pertama sesi NY.",
  },
  {
    daysAgo: 38, accountId: "main", symbol: "EUR/USD", market: "Forex", side: "Short",
    setup: "Impulse Chase", session: "New York", timeframe: "M15",
    entryPrice: "1.1030", exitPrice: "1.1045", stopLoss: "1.1045", takeProfit: "1.1000",
    positionSize: "0.65", initialRisk: "97.50", fees: "2.50", pnl: "-95.00",
    followedPlan: false, checkedCount: 1, mood: "Tired", tags: ["revenge", "News Volatility"],
    noteEn: "4th trade turned a +$260 morning into -$95 red day. Logged in Patience mirror to never repeat.",
    noteId: "Trade ke-4 mengubah pagi +$260 menjadi hari merah -$95. Dicatat di Patience agar tidak terulang.",
  },
  {
    daysAgo: 35, accountId: "main", symbol: "GBP/USD", market: "Forex", side: "Long",
    setup: "London Liquidity Sweep", session: "London", timeframe: "M15",
    entryPrice: "1.2940", exitPrice: "1.2976", stopLoss: "1.2925", takeProfit: "1.2980",
    positionSize: "0.75", initialRisk: "112.50", fees: "3.00", pnl: "267.00",
    followedPlan: true, checkedCount: 7, mood: "Calm", tags: ["A+", "patient"],
    noteEn: "Reset after two rest days; took one clean setup and walked away.",
    noteId: "Kembali tenang setelah jeda istirahat; ambil satu setup bersih lalu tutup chart.",
  },
  {
    daysAgo: 33, accountId: "swing", symbol: "NVDA", market: "Stocks", side: "Long",
    setup: "ORB Pullback", session: "New York", timeframe: "H1",
    entryPrice: "126.20", exitPrice: "130.40", stopLoss: "124.20", takeProfit: "131.00",
    positionSize: "45", initialRisk: "90.00", fees: "2.00", pnl: "187.00",
    followedPlan: true, checkedCount: 6, mood: "Focused", tags: ["pullback", "HTF Aligned"],
    noteEn: "Strong AI sector leadership; clean H1 pullback into opening range high.",
    noteId: "Sektor semikonduktor memimpin penguatan; pullback H1 rapi ke batas atas opening range.",
  },
  {
    daysAgo: 31, accountId: "main", symbol: "XAU/USD", market: "Commodities", side: "Short",
    setup: "HTF Support Bounce", session: "New York", timeframe: "H1",
    entryPrice: "2508.00", exitPrice: "2508.00", stopLoss: "2515.00", takeProfit: "2490.00",
    positionSize: "0.18", initialRisk: "126.00", fees: "0.00", pnl: "0.00",
    followedPlan: true, checkedCount: 6, mood: "Calm", tags: ["Breakeven", "Risk Managed"],
    noteEn: "Protected capital at breakeven when momentum stalled before London close.",
    noteId: "Amankan posisi di titik impas saat momentum melambat menjelang penutupan London.",
  },

  // ===================== MONTH 0 / LAST 30 DAYS (Days 29 .. 0 ago) =====================
  {
    daysAgo: 29, accountId: "main", symbol: "EUR/USD", market: "Forex", side: "Long",
    setup: "London Liquidity Sweep", session: "London", timeframe: "M15",
    entryPrice: "1.1060", exitPrice: "1.1095", stopLoss: "1.1045", takeProfit: "1.1098",
    positionSize: "0.80", initialRisk: "120.00", fees: "3.20", pnl: "276.80",
    followedPlan: true, checkedCount: 7, mood: "Focused", tags: ["A+", "London Killzone"],
    noteEn: "High-probability London sweep aligned with H4 bullish order flow.",
    noteId: "Sweep sesi London probabilitas tinggi searah order flow bullish H4.",
  },
  {
    daysAgo: 27, accountId: "swing", symbol: "BTC/USD", market: "Crypto", side: "Long",
    setup: "Trend Continuation", session: "Asia", timeframe: "H4",
    entryPrice: "63400.00", exitPrice: "65350.00", stopLoss: "62500.00", takeProfit: "65500.00",
    positionSize: "0.15", initialRisk: "135.00", fees: "6.00", pnl: "286.50",
    followedPlan: true, checkedCount: 6, mood: "Calm", tags: ["HTF Aligned", "Swing"],
    noteEn: "Clean H4 breakout above multi-week range resistance.",
    noteId: "Breakout H4 bersih menembus resistance konsolidasi beberapa minggu.",
  },
  {
    daysAgo: 24, accountId: "main", symbol: "NAS100", market: "Futures", side: "Long",
    setup: "ORB Pullback", session: "Overlap", timeframe: "M15",
    entryPrice: "20080.00", exitPrice: "20175.00", stopLoss: "20040.00", takeProfit: "20180.00",
    positionSize: "2.00", initialRisk: "130.00", fees: "5.00", pnl: "310.00",
    followedPlan: true, checkedCount: 7, mood: "Focused", tags: ["A+", "pullback"],
    noteEn: "Clean 15-minute ORB pullback; trailed final third to target.",
    noteId: "Pullback ORB 15 menit sangat rapi; kawal sisa posisi hingga target penuh.",
  },
  {
    daysAgo: 22, accountId: "swing", symbol: "AAPL", market: "Stocks", side: "Short",
    setup: "HTF Support Bounce", session: "New York", timeframe: "H1",
    entryPrice: "229.80", exitPrice: "231.90", stopLoss: "231.90", takeProfit: "225.50",
    positionSize: "45", initialRisk: "94.50", fees: "2.00", pnl: "-96.50",
    followedPlan: true, checkedCount: 5, mood: "Calm", tags: ["Good Loss", "Plan Followed"],
    noteEn: "Broad market bid lifted tech through supply; took planned -1R without hesitation.",
    noteId: "Dorongan beli indeks mengangkat saham teknologi menembus supply; terima -1R sesuai rencana.",
  },
  {
    daysAgo: 20, accountId: "main", symbol: "XAU/USD", market: "Commodities", side: "Long",
    setup: "HTF Support Bounce", session: "London", timeframe: "H1",
    entryPrice: "2532.00", exitPrice: "2551.00", stopLoss: "2525.00", takeProfit: "2552.00",
    positionSize: "0.20", initialRisk: "140.00", fees: "3.00", pnl: "377.00",
    followedPlan: true, checkedCount: 7, mood: "Calm", tags: ["A+", "patient"],
    noteEn: "Tapped H1 demand zone to the dollar during London morning.",
    noteId: "Menyentuh zona demand H1 dengan sangat presisi pada pagi sesi London.",
  },
  {
    daysAgo: 18, accountId: "swing", symbol: "SOL/USD", market: "Crypto", side: "Long",
    setup: "Impulse Chase", session: "New York", timeframe: "H1",
    entryPrice: "154.00", exitPrice: "157.20", stopLoss: "150.50", takeProfit: "162.00",
    positionSize: "25", initialRisk: "87.50", fees: "3.00", pnl: "77.00",
    followedPlan: false, checkedCount: 2, mood: "Anxious", tags: ["fomo", "early-exit"],
    noteEn: "Entered mid-range without H1 retest; lucky small gain but poor process.",
    noteId: "Masuk di tengah range tanpa retest H1; untung kecil tapi proses kurang disiplin.",
  },
  // Second Green-to-Red Giveback Day (daysAgo 16 -> +220 then -160, -135 = -75 net)
  {
    daysAgo: 16, accountId: "main", symbol: "GBP/USD", market: "Forex", side: "Long",
    setup: "London Liquidity Sweep", session: "London", timeframe: "M15",
    entryPrice: "1.3020", exitPrice: "1.3050", stopLoss: "1.3006", takeProfit: "1.3052",
    positionSize: "0.75", initialRisk: "105.00", fees: "3.00", pnl: "220.00",
    followedPlan: true, checkedCount: 6, mood: "Focused", tags: ["A+"],
    noteEn: "Solid morning London win (+2.1R).",
    noteId: "Kemenangan solid di sesi London pagi (+2.1R).",
  },
  {
    daysAgo: 16, accountId: "main", symbol: "XAU/USD", market: "Commodities", side: "Short",
    setup: "Impulse Chase", session: "New York", timeframe: "M15",
    entryPrice: "2562.00", exitPrice: "2570.00", stopLoss: "2570.00", takeProfit: "2545.00",
    positionSize: "0.20", initialRisk: "160.00", fees: "3.00", pnl: "-160.00",
    followedPlan: false, checkedCount: 2, mood: "Anxious", tags: ["Counter-Trend", "News Volatility"],
    noteEn: "Faded gold breakout right after US data with oversized $160 risk.",
    noteId: "Melawan breakout emas sesaat setelah data AS dengan risiko $160 melebihi batas.",
  },
  {
    daysAgo: 16, accountId: "main", symbol: "EUR/USD", market: "Forex", side: "Short",
    setup: "Impulse Chase", session: "New York", timeframe: "M15",
    entryPrice: "1.1088", exitPrice: "1.1105", stopLoss: "1.1105", takeProfit: "1.1055",
    positionSize: "0.80", initialRisk: "136.00", fees: "3.00", pnl: "-135.00",
    followedPlan: false, checkedCount: 2, mood: "Tired", tags: ["revenge"],
    noteEn: "Gave back morning profit. Closed platform and wrote walk-away rule.",
    noteId: "Mengembalikan profit pagi. Langsung tutup platform dan catat evaluasi jeda.",
  },
  {
    daysAgo: 13, accountId: "main", symbol: "NAS100", market: "Futures", side: "Long",
    setup: "ORB Pullback", session: "Overlap", timeframe: "M15",
    entryPrice: "20240.00", exitPrice: "20330.00", stopLoss: "20200.00", takeProfit: "20335.00",
    positionSize: "2.00", initialRisk: "130.00", fees: "5.00", pnl: "295.00",
    followedPlan: true, checkedCount: 7, mood: "Calm", tags: ["A+", "patient"],
    noteEn: "One setup, one trade, walked away immediately at target.",
    noteId: "Satu setup, satu eksekusi, langsung berhenti setelah target tercapai.",
  },
  {
    daysAgo: 11, accountId: "swing", symbol: "ETH/USD", market: "Crypto", side: "Long",
    setup: "HTF Support Bounce", session: "Asia", timeframe: "H4",
    entryPrice: "2620.00", exitPrice: "2715.00", stopLoss: "2580.00", takeProfit: "2720.00",
    positionSize: "2.50", initialRisk: "100.00", fees: "4.50", pnl: "233.00",
    followedPlan: true, checkedCount: 6, mood: "Focused", tags: ["HTF Aligned", "pullback"],
    noteEn: "Higher-timeframe demand bounce with clean ETH/BTC strength.",
    noteId: "Pantulan area demand H4 didukung penguatan rasio ETH/BTC.",
  },
  // Daily loss breach day (daysAgo 9 -> -$335 on main vs $300 daily limit)
  {
    daysAgo: 9, accountId: "main", symbol: "XAU/USD", market: "Commodities", side: "Long",
    setup: "HTF Support Bounce", session: "London", timeframe: "H1",
    entryPrice: "2575.00", exitPrice: "2566.50", stopLoss: "2566.50", takeProfit: "2595.00",
    positionSize: "0.20", initialRisk: "170.00", fees: "3.00", pnl: "-173.00",
    followedPlan: true, checkedCount: 5, mood: "Calm", tags: ["Good Loss"],
    noteEn: "Slightly wide stop ($170 risk) on volatile London candle.",
    noteId: "Jarak stop agak lebar (risiko $170) saat volatilitas London meningkat.",
  },
  {
    daysAgo: 9, accountId: "main", symbol: "GBP/USD", market: "Forex", side: "Long",
    setup: "ORB Pullback", session: "Overlap", timeframe: "M15",
    entryPrice: "1.2995", exitPrice: "1.2975", stopLoss: "1.2975", takeProfit: "1.3040",
    positionSize: "0.80", initialRisk: "160.00", fees: "2.00", pnl: "-162.00",
    followedPlan: false, checkedCount: 3, mood: "Anxious", tags: ["News Volatility"],
    noteEn: "Daily loss crossed $300 informational cap (-$335 total); stopped trading for the rest of the day.",
    noteId: "Rugi harian melewati batas pengingat $300 (total -$335); langsung berhenti trading hari itu.",
  },
  {
    daysAgo: 7, accountId: "swing", symbol: "BTC/USD", market: "Crypto", side: "Long",
    setup: "Trend Continuation", session: "New York", timeframe: "H4",
    entryPrice: "66200.00", exitPrice: "68100.00", stopLoss: "65300.00", takeProfit: "68200.00",
    positionSize: "0.14", initialRisk: "126.00", fees: "5.50", pnl: "260.50",
    followedPlan: true, checkedCount: 7, mood: "Calm", tags: ["A+", "HTF Aligned"],
    noteEn: "Clean trend continuation after 4-day bull flag consolidation.",
    noteId: "Kelanjutan tren bersih setelah konsolidasi bull flag selama 4 hari.",
  },
  {
    daysAgo: 6, accountId: "main", symbol: "EUR/USD", market: "Forex", side: "Long",
    setup: "London Liquidity Sweep", session: "London", timeframe: "M15",
    entryPrice: "1.0875", exitPrice: "1.0912", stopLoss: "1.0860", takeProfit: "1.0915",
    positionSize: "0.80", initialRisk: "120.00", fees: "3.20", pnl: "292.80",
    followedPlan: true, checkedCount: 7, mood: "Focused", tags: ["A+", "London Killzone"],
    noteEn: "Monday morning sweep + M15 market structure shift; effortless execution.",
    noteId: "Sweep pagi diikuti perubahan struktur M15; eksekusi sangat tenang.",
  },
  {
    daysAgo: 5, accountId: "swing", symbol: "NVDA", market: "Stocks", side: "Long",
    setup: "Trend Continuation", session: "New York", timeframe: "H1",
    entryPrice: "134.50", exitPrice: "139.20", stopLoss: "132.30", takeProfit: "139.50",
    positionSize: "45", initialRisk: "99.00", fees: "2.00", pnl: "209.50",
    followedPlan: true, checkedCount: 6, mood: "Focused", tags: ["HTF Aligned", "pullback"],
    noteEn: "Strong institutional volume off morning VWAP retest.",
    noteId: "Volume institusional kuat saat retest VWAP pembukaan pasar.",
  },
  {
    daysAgo: 5, accountId: "main", symbol: "USD/JPY", market: "Forex", side: "Short",
    setup: "Trend Continuation", session: "Asia", timeframe: "H1",
    entryPrice: "151.80", exitPrice: "151.35", stopLoss: "152.05", takeProfit: "151.30",
    positionSize: "0.60", initialRisk: "105.00", fees: "3.00", pnl: "177.00",
    followedPlan: null, checkedCount: 0, mood: "Calm", tags: ["patient"],
    noteEn: "Clean Tokyo continuation trade aligned with H4 lower high.",
    noteId: "Kelanjutan sesi Tokyo searah pembentukan lower-high di H4.",
  },
  {
    daysAgo: 4, accountId: "main", symbol: "NAS100", market: "Futures", side: "Long",
    setup: "ORB Pullback", session: "Overlap", timeframe: "M15",
    entryPrice: "20390.00", exitPrice: "20488.00", stopLoss: "20350.00", takeProfit: "20490.00",
    positionSize: "2.00", initialRisk: "130.00", fees: "5.00", pnl: "325.00",
    followedPlan: true, checkedCount: 7, mood: "Focused", tags: ["A+", "pullback"],
    noteEn: "Waited patiently for 10:00 ET liquidity sweep into ORB midpoint before buying.",
    noteId: "Sabar menunggu sapuan likuiditas ke titik tengah ORB sebelum membeli.",
  },
  {
    daysAgo: 3, accountId: "swing", symbol: "AAPL", market: "Stocks", side: "Long",
    setup: "ORB Pullback", session: "New York", timeframe: "H1",
    entryPrice: "232.40", exitPrice: "230.40", stopLoss: "230.40", takeProfit: "237.00",
    positionSize: "45", initialRisk: "90.00", fees: "2.00", pnl: "-92.00",
    followedPlan: true, checkedCount: 6, mood: "Calm", tags: ["Good Loss", "Plan Followed"],
    noteEn: "Clean entry and clean stop; zero emotional interference.",
    noteId: "Entry sesuai aturan dan stop loss rapi; tanpa intervensi emosi.",
  },
  {
    daysAgo: 2, accountId: "main", symbol: "XAU/USD", market: "Commodities", side: "Long",
    setup: "HTF Support Bounce", session: "London", timeframe: "H1",
    entryPrice: "2612.00", exitPrice: "2631.50", stopLoss: "2604.00", takeProfit: "2632.00",
    positionSize: "0.20", initialRisk: "160.00", fees: "3.00", pnl: "387.00",
    followedPlan: true, checkedCount: 7, mood: "Calm", tags: ["A+", "HTF Aligned"],
    noteEn: "Gold bounced cleanly from H4 demand; slightly larger $160 initial risk noted in Weekly Review.",
    noteId: "Emas memantul presisi dari demand H4; risiko awal $160 tercatat pada Evaluasi Mingguan.",
  },
  {
    daysAgo: 2, accountId: "swing", symbol: "BTC/USD", market: "Crypto", side: "Long",
    setup: "Trend Continuation", session: "New York", timeframe: "H4",
    entryPrice: "68450.00", exitPrice: "70200.00", stopLoss: "67600.00", takeProfit: "70400.00",
    positionSize: "0.14", initialRisk: "119.00", fees: "5.50", pnl: "239.50",
    followedPlan: true, checkedCount: 7, mood: "Focused", tags: ["A+", "patient"],
    noteEn: "Held runner into $70k psychological magnet with zero stress.",
    noteId: "Menahan posisi hingga area psikologis $70k dengan sangat tenang.",
  },
  {
    daysAgo: 1, accountId: "main", symbol: "GBP/USD", market: "Forex", side: "Short",
    setup: "London Liquidity Sweep", session: "London", timeframe: "M15",
    entryPrice: "1.2988", exitPrice: "1.2950", stopLoss: "1.3004", takeProfit: "1.2948",
    positionSize: "0.75", initialRisk: "120.00", fees: "3.00", pnl: "282.00",
    followedPlan: true, checkedCount: 7, mood: "Focused", tags: ["A+", "London Killzone"],
    noteEn: "Swept Asian range high at London open, broke M15 swing low, hit 2.3R target.",
    noteId: "Menyapu batas atas sesi Asia saat pembukaan London, target 2.3R tercapai.",
  },
  {
    daysAgo: 1, accountId: "swing", symbol: "ETH/USD", market: "Crypto", side: "Short",
    setup: "Impulse Chase", session: "New York", timeframe: "M15",
    entryPrice: "2685.00", exitPrice: "2709.00", stopLoss: "2709.00", takeProfit: "2630.00",
    positionSize: "3.50", initialRisk: "84.00", fees: "4.00", pnl: "-88.00",
    followedPlan: false, checkedCount: 2, mood: "Anxious", tags: ["Counter-Trend", "fomo"],
    noteEn: "Tried to short ETH while BTC was breaking higher; good reminder to align crypto beta.",
    noteId: "Mencoba short ETH saat BTC sedang menguat; pengingat agar selalu selaras arah market utama.",
  },
  {
    daysAgo: 0, accountId: "main", symbol: "EUR/USD", market: "Forex", side: "Long",
    setup: "London Liquidity Sweep", session: "London", timeframe: "M15",
    entryPrice: "1.0892", exitPrice: "1.0928", stopLoss: "1.0877", takeProfit: "1.0930",
    positionSize: "0.80", initialRisk: "120.00", fees: "3.20", pnl: "284.80",
    followedPlan: true, checkedCount: 7, mood: "Calm", tags: ["A+", "HTF Aligned", "patient"],
    noteEn: "One textbook setup today: waited for London sweep + retest, took +2.37R, closed charts.",
    noteId: "Satu setup buku teks hari ini: tunggu sweep London + retest, raih +2.37R, langsung tutup chart.",
  },
  {
    daysAgo: 0, accountId: "swing", symbol: "SOL/USD", market: "Crypto", side: "Long",
    setup: "Trend Continuation", session: "Asia", timeframe: "H4",
    entryPrice: "162.50", exitPrice: "168.90", stopLoss: "159.50", takeProfit: "169.50",
    positionSize: "30", initialRisk: "90.00", fees: "3.00", pnl: "189.00",
    followedPlan: null, checkedCount: 0, mood: "Focused", tags: ["HTF Aligned", "Swing"],
    noteEn: "Clean H4 breakout continuation on Solana.",
    noteId: "Kelanjutan breakout H4 yang bersih pada Solana.",
  },
];

const PLAYBOOK_EN: PlaybookRule[] = [
  { id: "b1", group: "Before trading", text: "Check emotional state and energy before opening charts", checked: true },
  { id: "b2", group: "Before trading", text: "Mark HTF liquidity, key session highs/lows, and red-folder news", checked: true },
  { id: "b3", group: "Before trading", text: "Define exact invalidation and USD initial risk (max $150)", checked: true },
  { id: "d1", group: "While trading", text: "Wait for candle close confirmation — never chase mid-candle", checked: true },
  { id: "d2", group: "While trading", text: "Respect stop loss and let winner reach target without panic closing", checked: false },
  { id: "a1", group: "After trading", text: "Screenshot Before/After chart and log process honesty", checked: true },
  { id: "a2", group: "After trading", text: "Lock session after +2R win or 2 consecutive losses", checked: false },
];

const PLAYBOOK_ID: PlaybookRule[] = [
  { id: "b1", group: "Before trading", text: "Cek kondisi emosi dan fokus sebelum membuka chart", checked: true },
  { id: "b2", group: "Before trading", text: "Tandai likuiditas HTF, high/low sesi, dan jadwal berita utama", checked: true },
  { id: "b3", group: "Before trading", text: "Tetapkan titik invalidasi dan risiko awal USD (maks $150)", checked: true },
  { id: "d1", group: "While trading", text: "Tunggu konfirmasi close candle — jangan kejar harga di tengah jalan", checked: true },
  { id: "d2", group: "While trading", text: "Hormati stop loss dan biarkan posisi berjalan sesuai rencana", checked: false },
  { id: "a1", group: "After trading", text: "Simpan screenshot chart Before/After dan catat kejujuran proses", checked: true },
  { id: "a2", group: "After trading", text: "Kunci sesi setelah profit +2R atau 2 kali rugi beruntun", checked: false },
];

function buildChecklistSnapshot(rules: PlaybookRule[], checkedCount: number): RuleSnapshot[] {
  if (checkedCount <= 0) return [];
  return rules.map((rule, idx) => ({
    id: rule.id,
    text: rule.text,
    checked: idx < checkedCount,
  }));
}

export function createThreeMonthDummyData(
  locale: AppLocale = "en",
  baseDate?: Date,
): JournalData {
  const isId = locale === "id";
  const playbook = (isId ? PLAYBOOK_ID : PLAYBOOK_EN).map((r) => ({ ...r }));

  const accounts: TradingAccount[] = [
    { id: "main", name: "Main account", startingBalance: 10000 },
    { id: "swing", name: "Swing & Crypto", startingBalance: 5000 },
  ];

  const trades: Trade[] = SEED_TRADES.map((seed, idx) => ({
    id: idx + 1,
    symbol: seed.symbol,
    market: seed.market,
    side: seed.side,
    setup: seed.setup,
    tradeDate: offsetDateString(seed.daysAgo, baseDate),
    pnl: Number(seed.pnl).toFixed(2),
    mood: seed.mood,
    notes: isId ? seed.noteId : seed.noteEn,
    isDemo: false,
    accountId: seed.accountId,
    entryPrice: seed.entryPrice,
    exitPrice: seed.exitPrice,
    positionSize: seed.positionSize,
    stopLoss: seed.stopLoss,
    takeProfit: seed.takeProfit,
    fees: seed.fees,
    initialRisk: seed.initialRisk,
    timeframe: seed.timeframe,
    session: seed.session,
    tags: [...seed.tags],
    ...(typeof seed.followedPlan === "boolean" ? { followedPlan: seed.followedPlan } : {}),
    checklist: buildChecklistSnapshot(playbook, seed.checkedCount),
    attachments: [],
  }));

  const setupBlueprints: SetupBlueprint[] = [
    {
      id: "bp-london-sweep",
      name: "London Liquidity Sweep",
      market: "Forex",
      timeframe: "M15",
      session: "London",
      entryTrigger: isId
        ? "Sapuan likuiditas di atas/bawah range Asia diikuti Market Structure Shift + retest FVG M15."
        : "Sweep of Asian range high/low followed by M15 Market Structure Shift + FVG retest.",
      invalidation: isId
        ? "2 pip di luar ekor candle sweep (maksimal risiko $150)."
        : "2 pips beyond the sweep wick high/low (max $150 initial risk).",
      targetPlan: isId
        ? "Ambil 50% posisi di +1.5R (geser SL ke BEP), sisanya di likuiditas seberang (+2.3R)."
        : "Scale 50% at +1.5R (stop to breakeven), hold runner to opposing range liquidity (+2.3R).",
      notes: isId
        ? "Hindari eksekusi 15 menit sebelum rilis CPI/NFP."
        : "Skip execution within 15 minutes of high-impact CPI/NFP releases.",
    },
    {
      id: "bp-orb-pullback",
      name: "ORB Pullback",
      market: "Futures",
      timeframe: "M15",
      session: "Overlap",
      entryTrigger: isId
        ? "Breakout candle 15 menit pertama sesi NY dengan volume tinggi, masuk saat pullback ke batas ORB / VWAP."
        : "Clean 15m NY opening range breakout with displacement, enter on first pullback to ORB boundary / VWAP.",
      invalidation: isId
        ? "Penutupan M15 kembali ke bawah titik tengah opening range."
        : "M15 close back inside the midpoint of the opening range.",
      targetPlan: isId
        ? "Target tetap +2.2R hingga +2.5R pada ekstensi deviasi standar sesi."
        : "Fixed +2.2R to +2.5R at session standard deviation extension.",
      notes: isId
        ? "Setup terbaik pada NAS100 & saham teknologi likuid saat arah D1 searah."
        : "Highest win rate on NAS100 and liquid tech equities when D1 trend aligns.",
    },
    {
      id: "bp-htf-bounce",
      name: "HTF Support Bounce",
      market: "Commodities",
      timeframe: "H1",
      session: "New York",
      entryTrigger: isId
        ? "Harga menyentuh zona demand/supply H1–H4 yang belum tersentuh + konfirmasi pinbar/engulfing."
        : "Price taps fresh H1/H4 institutional demand or supply zone + engulfing confirmation.",
      invalidation: isId
        ? "Di luar batas zona demand/supply H1 ditambah buffer ATR."
        : "Beyond the distal edge of the H1 zone plus 0.25 ATR buffer.",
      targetPlan: isId
        ? "Target ayunan high/low H4 berikutnya minimal +2.0R."
        : "Next H4 structural swing high/low for minimum +2.0R.",
      notes: isId
        ? "Sangat efektif pada XAU/USD dan ETH/USD setelah sapuan sesi awal."
        : "Works reliably on XAU/USD and ETH/USD after early-session liquidity sweeps.",
    },
    {
      id: "bp-trend-cont",
      name: "Trend Continuation",
      market: "Crypto",
      timeframe: "H4",
      session: "Asia",
      entryTrigger: isId
        ? "Konsolidasi flag sempit di atas EMA 21 H4/D1 diikuti breakout searah tren utama."
        : "Tight bull/bear flag pullback holding H4/D1 21 EMA followed by range expansion.",
      invalidation: isId
        ? "Di bawah swing higher-low terakhir pada H4."
        : "Below the most recent H4 higher-low swing pivot.",
      targetPlan: isId
        ? "Tahan posisi swing untuk +2.0R hingga +2.5R."
        : "Swing hold into +2.0R to +2.5R measured move.",
      notes: isId
        ? "Gunakan di akun Swing & Crypto tanpa perlu memantau tiap menit."
        : "Executed calmly on Swing & Crypto account without watching 1m ticks.",
    },
  ];

  // Intentional no-trade days (chosen on daysAgo not present in SEED_TRADES!) + active day notes
  const restDayOffsets = [80, 68, 52, 37, 25, 15, 8];
  const activeDayOffsets = [38, 20, 13, 6, 4, 2, 0];

  const dayJournals: DayJournalEntry[] = [
    ...restDayOffsets.map((d, i) => ({
      date: offsetDateString(d, baseDate),
      intentionalNoTrade: true,
      preMarketPlan: isId
        ? "Kalender ekonomi padat (CPI / FOMC) & struktur harga di tengah range — rencana hari ini cukup amati tanpa paksa posisi."
        : "High-impact macro calendar (CPI / FOMC) & choppy mid-range structure — plan is to observe and protect capital.",
      postSessionNote: isId
        ? `Hari istirahat terencana #${i + 1}: bersyukur tidak memaksakan klik saat spread melebar.`
        : `Intentional rest day #${i + 1}: glad I stayed flat while spreads widened and whipsawed both sides.`,
    })),
    ...activeDayOffsets.map((d) => ({
      date: offsetDateString(d, baseDate),
      intentionalNoTrade: false,
      preMarketPlan: isId
        ? "Fokus hanya pada 1 setup A+ (London Sweep atau ORB Pullback) dengan risiko maksimal $130."
        : "Focus strictly on 1 A+ setup (London Sweep or ORB Pullback) with max $130 initial risk.",
      postSessionNote:
        d === 38
          ? isId
            ? "Evaluasi jujur: pagi sudah +$260 tapi overtrade di sesi NY membuat hari berakhir merah. Wajib kunci sesi setelah +2R."
            : "Honest review: up +$260 in London then overtraded NY into a red day. Must enforce walk-away rule at +2R."
          : isId
            ? "Eksekusi tenang sesuai rencana, jurnal langsung dilengkapi begitu posisi selesai."
            : "Calm execution aligned with pre-market plan; journaled immediately after closing charts.",
    })),
  ];

  const moodOffsets: { d: number; mood: "Calm" | "Focused" | "Anxious" | "Tired"; en: string; id: string }[] = [
    { d: 42, mood: "Calm", en: "Slept 8 hours, unhurried morning prep.", id: "Tidur cukup 8 jam, persiapan pagi tanpa terburu-buru." },
    { d: 38, mood: "Anxious", en: "Felt urge to chase NY open after winning morning.", id: "Muncul dorongan mengejar pembukaan NY setelah menang pagi." },
    { d: 35, mood: "Calm", en: "Reset walk before London session worked wonders.", id: "Jalan pagi sebelum sesi London membuat pikiran kembali jernih." },
    { d: 29, mood: "Focused", en: "Clear levels, zero distractions.", id: "Level harga jelas, fokus penuh tanpa gangguan." },
    { d: 24, mood: "Focused", en: "Trusted the M15 pullback without micromanaging.", id: "Percaya pada skenario pullback M15 tanpa panik." },
    { d: 18, mood: "Anxious", en: "Slightly impatient watching crypto move without me.", id: "Sedikit kurang sabar melihat pergerakan kripto yang cepat." },
    { d: 16, mood: "Tired", en: "Late night before trading lowered discipline in NY.", id: "Kurang tidur malam sebelumnya menurunkan disiplin di sesi NY." },
    { d: 13, mood: "Calm", en: "One trade and done — peaceful afternoon.", id: "Satu trade selesai lalu tutup layar — sore yang tenang." },
    { d: 9, mood: "Anxious", en: "Stopped immediately when daily loss reminder triggered.", id: "Langsung berhenti saat pengingat batas rugi harian muncul." },
    { d: 6, mood: "Focused", en: "Sharp execution on Monday London open.", id: "Eksekusi tajam pada pembukaan London hari Senin." },
    { d: 4, mood: "Focused", en: "Patiently waited 45m for ORB midpoint retest.", id: "Sabar menunggu 45 menit untuk retest titik tengah ORB." },
    { d: 2, mood: "Calm", en: "Grounded breathing before Gold entry.", id: "Latihan napas singkat sebelum eksekusi XAU/USD." },
    { d: 1, mood: "Focused", en: "Locked in London gain and stepped away.", id: "Kunci profit sesi London dan langsung istirahat." },
    { d: 0, mood: "Calm", en: "Steady rhythm, process score above 80% this month.", id: "Ritme stabil, skor kepatuhan rencana di atas 80% bulan ini." },
  ];

  const moodHistory: MoodEntry[] = moodOffsets.map((m) => ({
    date: offsetDateString(m.d, baseDate),
    mood: m.mood,
    note: isId ? m.id : m.en,
  }));

  const reflections: WeeklyReflection[] = [35, 28, 21, 14, 7, 0].map((d, idx) => ({
    id: `ref-dummy-${idx + 1}`,
    date: offsetDateString(d, baseDate),
    wentWell: isId
      ? `Minggu ke-${idx + 1}: Setup London Liquidity Sweep dan ORB Pullback konsisten memberi R-multiple > 2R saat sabar menunggu retest.`
      : `Week ${idx + 1}: London Liquidity Sweep and ORB Pullback consistently delivered > 2R whenever I waited for the retest.`,
    learned: isId
      ? "Hampir seluruh kerugian yang tidak perlu berasal dari trade ke-3 atau ke-4 di sore hari saat energi mulai turun."
      : "Nearly every avoidable drawdown came from a 3rd or 4th afternoon trade when mental energy dipped.",
    nextWeek: isId
      ? "Pertahankan batas maksimal 2 trade per akun per hari dan langsung akhiri sesi setelah mencapai +2R."
      : "Keep a strict 2-trade daily cap per account and close the terminal immediately after banking +2R.",
  }));

  const walkAwayLogs: WalkAwayLog[] = [
    {
      id: "wa-1",
      date: offsetDateString(35, baseDate),
      accountId: "main",
      reason: "lock_profit",
      note: isId ? "Kunci +$267 di sesi London tanpa tergoda sesi NY." : "Locked +$267 in London without touching NY chop.",
    },
    {
      id: "wa-2",
      date: offsetDateString(24, baseDate),
      accountId: "main",
      reason: "lock_profit",
      note: isId ? "Target ORB NAS100 tercapai, langsung matikan chart." : "Hit NAS100 ORB target cleanly and closed charts.",
    },
    {
      id: "wa-3",
      date: offsetDateString(16, baseDate),
      accountId: "main",
      reason: "stop_giveback",
      note: isId ? "Berhenti total agar giveback tidak melebar." : "Stepped away immediately to halt afternoon giveback.",
    },
    {
      id: "wa-4",
      date: offsetDateString(9, baseDate),
      accountId: "main",
      reason: "respect_loss",
      note: isId ? "Patuhi batas rugi harian dan evaluasi tenang." : "Respected daily loss threshold and preserved capital.",
    },
    {
      id: "wa-5",
      date: offsetDateString(4, baseDate),
      accountId: "main",
      reason: "protect_focus",
      note: isId ? "Satu eksekusi berkualitas sudah cukup untuk hari ini." : "One A+ trade was enough — saved mental capital for tomorrow.",
    },
    {
      id: "wa-6",
      date: offsetDateString(0, baseDate),
      accountId: "main",
      reason: "lock_profit",
      note: isId ? "Sesi hijau +2.37R di EUR/USD selesai dengan tenang." : "Green +2.37R London session complete — done for the day.",
    },
  ];

  const recentMarked = [offsetDateString(4, baseDate), offsetDateString(2, baseDate), offsetDateString(1, baseDate), offsetDateString(0, baseDate)];
  const goals: Intention[] = [
    {
      id: "goal-1",
      text: isId ? "Hanya ambil setup yang tertulis di Playbook Blueprint" : "Only execute setups defined in my Playbook Blueprints",
      target: 5,
      progress: 4,
      markedDates: recentMarked,
    },
    {
      id: "goal-2",
      text: isId ? "Tutup platform setelah mencapai +2R atau maksimal 2 trade" : "Walk away after banking +2R or reaching 2 trades",
      target: 5,
      progress: 3,
      markedDates: recentMarked.slice(1),
    },
    {
      id: "goal-3",
      text: isId ? "Isi catatan risiko awal & evaluasi kejujuran rencana di setiap trade" : "Log initial USD risk & honest plan adherence on every trade",
      target: 7,
      progress: 4,
      markedDates: recentMarked,
    },
  ];

  const youtubeLinks: SavedYoutubeVideo[] = [
    {
      id: "yt-reminder-1",
      videoId: "Q6ms3xJ2c1k",
      url: "https://www.youtube.com/watch?v=Q6ms3xJ2c1k",
      title: isId
        ? "Berpikir dalam Probabilitas — Pengingat Pra-Sesi"
        : "Thinking in Probabilities — Pre-Session Reminder",
      category: "reminder",
      note: isId
        ? "Satu trade tidak menentukan kualitas prosesku. Tunggu setup A+ dan jaga risiko tetap terukur."
        : "One trade never defines my edge. Wait for the A+ setup and keep risk strictly predefined.",
      pinned: true,
      addedAt: offsetDateString(12, baseDate),
    },
    {
      id: "yt-followup-2",
      videoId: "hR2A8vX5wP0",
      url: "https://www.youtube.com/watch?v=hR2A8vX5wP0&t=120s",
      title: isId
        ? "Studi Struktur & Likuiditas Sesi London"
        : "London Session Liquidity Sweep Case Study",
      category: "followup",
      note: isId
        ? "Follow-up menit 02:00: perhatikan konfirmasi perpindahan struktur M15 sebelum entry."
        : "Follow-up at 02:00: wait for clean M15 displacement after the sweep before entering.",
      startSeconds: 120,
      pinned: false,
      addedAt: offsetDateString(6, baseDate),
    },
    {
      id: "yt-motivation-3",
      videoId: "9zL7mN4kR1v",
      url: "https://www.youtube.com/watch?v=9zL7mN4kR1v",
      title: isId
        ? "Disiplin & Kesabaran untuk Konsistensi Jangka Panjang"
        : "Patience & Walk-Away Discipline After Green Mornings",
      category: "motivation",
      note: isId
        ? "Melindungi profit pagi dan menutup chart tepat waktu adalah kemenangan sejati."
        : "Protecting a green morning and walking away calm is a real trading victory.",
      pinned: false,
      addedAt: offsetDateString(2, baseDate),
    },
  ];

  const strategyLibrary: StrategyLibraryItem[] = [
    {
      id: "strat-link-1",
      kind: "link",
      title: isId
        ? "Catatan Likuiditas Sesi London & New York"
        : "London & NY Session Liquidity Playbook",
      url: "https://www.tradingview.com/chart/",
      addedAt: offsetDateString(14, baseDate),
    },
    {
      id: "strat-link-2",
      kind: "link",
      title: isId
        ? "Kerangka Probabilitas & Manajemen Risiko R"
        : "R-Multiple Risk & Probability Framework",
      url: "https://www.cmegroup.com/education.html",
      addedAt: offsetDateString(5, baseDate),
    },
  ];

  return {
    trades,
    settings: {
      id: 1,
      name: isId ? "Trader Bloom" : "Alex",
      mood: "Calm",
      moodDate: offsetDateString(0, baseDate),
      goal: goals[0].text,
      goalProgress: goals[0].progress,
      goalTarget: goals[0].target,
      playbook,
      accounts,
      goals,
      moodHistory,
      reflections,
      theme: "light",
      locale,
      reduceMotion: false,
      includeSamples: false,
      riskLimits: { perTrade: 150, dailyLoss: 300 },
      backupReminderDays: 14,
      patienceLocale: locale,
      patienceMaxTrades: 3,
      walkAwayLogs,
      dayJournals,
      setupBlueprints,
      youtubeLinks,
      strategyLibrary,
    },
  };
}

export type GeneratedDummyChartSpec = {
  targetSymbol: string;
  fileName: string;
  stage: AttachmentStage;
  captionEn: string;
  captionId: string;
  blob: Blob;
};

/** Generate lightweight botanical candlestick PNG chart blobs in the browser for Chartbook testing. */
export async function generateDummyChartImages(): Promise<GeneratedDummyChartSpec[]> {
  if (typeof document === "undefined") return [];

  const specs: Omit<GeneratedDummyChartSpec, "blob">[] = [
    {
      targetSymbol: "EUR/USD",
      fileName: "eurusd-m15-before-sweep.png",
      stage: "Before",
      captionEn: "EUR/USD M15 — Asian low liquidity pool marked prior to London open.",
      captionId: "EUR/USD M15 — Area likuiditas low Asia ditandai sebelum pembukaan London.",
    },
    {
      targetSymbol: "EUR/USD",
      fileName: "eurusd-m15-after-target.png",
      stage: "After",
      captionEn: "EUR/USD M15 — Clean displacement + FVG retest hitting +2.37R target.",
      captionId: "EUR/USD M15 — Displacement bersih + retest FVG menyentuh target +2.37R.",
    },
    {
      targetSymbol: "GBP/USD",
      fileName: "gbpusd-m15-entry-trigger.png",
      stage: "Entry",
      captionEn: "GBP/USD M15 — Short entry triggered on bearish structure shift after sweep.",
      captionId: "GBP/USD M15 — Entry short aktif saat struktur patah turun pasca sweep.",
    },
    {
      targetSymbol: "BTC/USD",
      fileName: "btcusd-h4-htf-context.png",
      stage: "HTF",
      captionEn: "BTC/USD H4 — Multi-week bull flag breakout holding above rising 21 EMA.",
      captionId: "BTC/USD H4 — Breakout bull flag bertahan kokoh di atas EMA 21.",
    },
    {
      targetSymbol: "XAU/USD",
      fileName: "xauusd-h1-demand-bounce.png",
      stage: "After",
      captionEn: "XAU/USD H1 — Fresh demand zone tap delivering +$387 realized gain.",
      captionId: "XAU/USD H1 — Pantulan presisi zona demand menghasilkan +$387.",
    },
    {
      targetSymbol: "NAS100",
      fileName: "nas100-m15-orb-pullback.png",
      stage: "Entry",
      captionEn: "NAS100 M15 — Opening Range Breakout 50% retest with tight invalidation.",
      captionId: "NAS100 M15 — Retest 50% Opening Range Breakout dengan stop ketat.",
    },
  ];

  const out: GeneratedDummyChartSpec[] = [];

  for (let sIdx = 0; sIdx < specs.length; sIdx++) {
    const spec = specs[sIdx];
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 450;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    // Warm dark espresso chart canvas
    ctx.fillStyle = "#191715";
    ctx.fillRect(0, 0, 800, 450);

    // Subtle price grid
    ctx.strokeStyle = "#2b2622";
    ctx.lineWidth = 1;
    for (let y = 60; y <= 390; y += 55) {
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(750, y);
      ctx.stroke();
    }
    for (let x = 80; x <= 740; x += 110) {
      ctx.beginPath();
      ctx.moveTo(x, 45);
      ctx.lineTo(x, 405);
      ctx.stroke();
    }

    const isShort = spec.fileName.includes("gbpusd");
    // Reward / Risk shaded zones
    const entryY = isShort ? 175 : 275;
    const tpY = isShort ? 330 : 110;
    const slY = isShort ? 115 : 335;

    ctx.fillStyle = "rgba(118, 173, 133, 0.14)";
    ctx.fillRect(360, Math.min(entryY, tpY), 350, Math.abs(tpY - entryY));
    ctx.fillStyle = "rgba(218, 128, 108, 0.15)";
    ctx.fillRect(360, Math.min(entryY, slY), 350, Math.abs(slY - entryY));

    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "#8bc296";
    ctx.beginPath();
    ctx.moveTo(360, tpY);
    ctx.lineTo(710, tpY);
    ctx.stroke();

    ctx.strokeStyle = "#e6d5a9";
    ctx.beginPath();
    ctx.moveTo(360, entryY);
    ctx.lineTo(710, entryY);
    ctx.stroke();

    ctx.strokeStyle = "#e39a89";
    ctx.beginPath();
    ctx.moveTo(360, slY);
    ctx.lineTo(710, slY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Deterministic synthetic candlesticks
    const candleCount = spec.stage === "Before" ? 16 : 26;
    let prevClose = isShort ? 225 : 245;
    const emaPoints: { x: number; y: number }[] = [];

    for (let i = 0; i < candleCount; i++) {
      const x = 68 + i * 25;
      const wave = Math.sin((i + sIdx * 2) * 0.65) * 14;
      let drift = 0;
      if (i < 11) drift = isShort ? -4.5 : 4.2; // Sweep into level
      else drift = isShort ? 7.2 : -7.6; // Displacement to target

      const open = prevClose;
      const close = Math.max(85, Math.min(370, open + drift + wave * 0.45));
      const high = Math.min(68, open, close) === 68 ? 68 : Math.min(open, close) - (8 + ((i * 7 + sIdx * 3) % 14));
      const low = Math.max(open, close) + (8 + ((i * 5 + sIdx * 4) % 13));
      const bullish = close <= open; // y-axis inverted

      ctx.strokeStyle = bullish ? "#86be93" : "#d98b79";
      ctx.fillStyle = bullish ? "#86be93" : "#d98b79";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, high);
      ctx.lineTo(x, low);
      ctx.stroke();

      const bodyTop = Math.min(open, close);
      const bodyH = Math.max(4, Math.abs(close - open));
      ctx.fillRect(x - 6, bodyTop, 12, bodyH);

      emaPoints.push({ x, y: (open + close) / 2 + (isShort ? -10 : 12) });
      prevClose = close;
    }

    // Smooth EMA line
    ctx.strokeStyle = "rgba(232, 209, 155, 0.65)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    emaPoints.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    // Header badge
    ctx.fillStyle = "#26221e";
    ctx.fillRect(36, 18, 330, 30);
    ctx.fillStyle = "#efe6da";
    ctx.font = "bold 13px system-ui, -apple-system, sans-serif";
    ctx.fillText(`${spec.fileName.split("-")[0].toUpperCase()} · ${spec.stage.toUpperCase()} STAGE`, 48, 38);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (blob) {
      out.push({ ...spec, blob });
    }
  }

  return out;
}
