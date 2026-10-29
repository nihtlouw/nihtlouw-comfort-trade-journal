"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, Check, CheckCircle2, CircleAlert, Compass, Flame, HeartHandshake,
  Hourglass, Pause, Play, RotateCcw, ShieldCheck, Sparkles, Trash2, TrendingUp, Wind,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compactCurrency, currency, shortDate, todayString } from "@/lib/format";
import {
  getDrawdownRecoveryRows, getJournalSimPreset, getPatienceMirror,
  getTodaySessionPulse, simulateCompoundingComparison,
} from "@/lib/patience";
import {
  DEFAULT_ACCOUNT, type JournalSettings, type PatienceLocale,
  type Trade, type TradingAccount, type WalkAwayLog, type WalkAwayReason,
} from "@/lib/types";
import { CardTitle } from "@/components/journal-ui";

const PAUSE_SECONDS = 60;

const copy = {
  en: {
    eyebrow: "PATIENCE & COMPOUNDING",
    heroTitle: "Slow down before the next click.",
    heroBody: "Long-term growth comes from rolling a small, protected edge forward—never from forcing one bad afternoon to pay everything back.",
    langLabel: "Patience page language",
    todayTrades: "Today’s trades",
    todayPeak: "Today’s peak P&L",
    todayCurrent: "Current today",
    statusGreenToRed: (peak: string, now: string) =>
      `Today reached ${peak} and now sits at ${now}. Wanting ${peak} back immediately is peak anchoring—stepping away protects the capital you will compound tomorrow.`,
    statusGiveback: (peak: string, now: string, pct: number) =>
      `Today peaked at ${peak} and gave back ${pct}% to ${now}. Closing green with ${now} still grows your base; chasing the peak is how green days turn negative.`,
    statusLossStreak: (count: number) =>
      `${count} trades recorded today in the red. A controlled small loss is normal overhead in compounding—stopping now keeps recovery effortless.`,
    statusOverCapGreen: (count: number, cap: number, now: string) =>
      `${count} trades logged today (above your ${cap}-trade comfort pace) at ${now}. Guard against the house-money effect loosening your standards.`,
    statusCalm: "Your job today isn’t to recover yesterday or hit a daily quota—only to take clean setups with ordinary risk, or rest.",
    resetEyebrow: "HOT-MOMENT BRAKE",
    resetTitle: "60-second impulse reset",
    resetDesc: "Put space between an emotional urge and the next order.",
    startPause: "Start 60s pause",
    pauseTimer: "Pause timer",
    resumeTimer: "Resume",
    resetTimer: "Reset",
    doneReset: "Pause complete · Restart",
    breathButton: "Guided breathing",
    timerCueRunning: "Hands off the mouse · Inhale slowly · Let the urge pass without acting on it.",
    timerCueDone: "60 seconds complete. Read the three checks below honestly before touching your chart.",
    timerCueIdle: "Feeling impatient after a loss or profit giveback? Take one quiet minute first.",
    checksHeading: "Three honest checks before another trade",
    checks: [
      "The next trade matches my written Playbook—not an urge to win back lost profit or balance.",
      "My position risk stays ordinary (1R), not enlarged to recover faster.",
      "If this next trade also stops out, my capital and mind stay calm for tomorrow.",
    ],
    checksAllYes: "All three checks are grounded. If a real setup is present, keep risk ordinary.",
    checksWait: "Until all three are a calm yes, not clicking is already a profitable process decision.",
    walkEyebrow: "SESSION BOUNDARY",
    walkTitle: "End today’s session with intention",
    walkDesc: "Record a deliberate stop so walking away feels like the win it truly is.",
    closedBadge: "Session closed for today",
    savedDaysLabel: (count: number) => `${count} ${count === 1 ? "disciplined walk-away day" : "disciplined walk-away days"}`,
    reasonLabel: "Why I’m stepping away today",
    reasons: {
      lock_profit: "Lock in remaining green day",
      stop_giveback: "Stop intraday profit giveback",
      respect_loss: "Accept a small planned red day",
      protect_focus: "Step away from emotional fatigue",
    } as Record<WalkAwayReason, string>,
    noteLabel: "Short note to self (optional)",
    notePlaceholder: "e.g. Kept +$90 instead of chasing my morning peak.",
    saveWalkAway: "End today’s session",
    updateWalkAway: "Update today’s session stop",
    removeWalkAway: "Remove today’s stop",
    walkSavedToast: "Session closed for today. Well done stepping back.",
    walkRemovedToast: "Today’s session stop removed.",
    walkHonestNote: "Self-commitment saved in your journal; Bloom never connects to or blocks a broker.",
    recentWalkHeading: "Recent walk-away decisions",
    noWalkYet: "No walk-away sessions logged yet. Closing the screen on time counts here.",
    mirrorEyebrow: "JOURNAL MIRROR",
    mirrorTitle: "Overtrade & sequence mirror",
    mirrorDesc: "Compare your early daily trades against extra entries on the same account and date.",
    capLabel: "Comfort trades / day",
    tradesPerDay: (n: number) => `${n} ${n === 1 ? "trade" : "trades"} / day`,
    earlyBoxTitle: (cap: number) => (cap === 1 ? "Trade #1 each day" : `Trades #1–#${cap} each day`),
    extraBoxTitle: (cap: number) => `Trades #${cap + 1}+ (extra entries)`,
    winRateWord: "win rate",
    tradesWord: (n: number) => `${n} ${n === 1 ? "trade" : "trades"}`,
    stoppedAtCapLabel: (cap: number) => `If stopped at #${cap}/day`,
    actualNetLabel: "Actual recorded net P&L",
    mirrorNoExtra: (cap: number) => `No sessions exceed ${cap} ${cap === 1 ? "trade" : "trades"} per day in this view.`,
    mirrorExtraCost: (cap: number, loss: string, days: number) =>
      `Across ${days} ${days === 1 ? "trading day" : "trading days"}, entries after trade #${cap} reduced net P&L by ${loss}.`,
    mirrorExtraGain: (cap: number, gain: string) =>
      `Entries after trade #${cap} added ${gain} in these records—keep watching whether late trades stay A-grade.`,
    mirrorFootnote: "Intra-day sequence follows trade entry ID per account and date (execution clock times aren’t stored). Past records don’t guarantee future outcomes.",
    givebackEyebrow: "PEAK ANCHORING CHECK",
    givebackTitle: "Profit giveback & green-to-red days",
    givebackDesc: "Days that reached a positive peak and then gave back ≥50% or finished negative.",
    greenToRedStat: "Green → Red days",
    heavyGivebackStat: "≥50% giveback days",
    badgeGreenToRed: "Green → Red",
    badgeGiveback: (pct: number) => `${pct}% giveback`,
    peakReached: (peak: string, num: number) => `Peak ${peak} at trade #${num}`,
    endedAt: (end: string, drop: string) => `Ended ${end} (${drop} from peak)`,
    viewDay: "View day",
    noGivebackDays: "No green-to-red or ≥50% profit-giveback days in this view.",
    simEyebrow: "REALISTIC GROWTH MODEL",
    simTitle: "Realistic compounding vs. revenge days",
    simDesc: "See how rolling proportional % risk grows capital—and how a few emotional -5R blowups erase months of compounding.",
    useJournalBtn: "Use my journal stats",
    journalAppliedR: (wr: number, rr: number) => `Applied from your visible trades: ${wr}% win rate · ${rr}R payoff (from recorded R).`,
    journalAppliedPnl: (wr: number, rr: number) => `Applied from your visible trades: ${wr}% win rate · ${rr}× avg win/loss ratio.`,
    journalNeedMore: "Log at least 3 decided trades (with ≥1 win and ≥1 loss) to pull stats from your journal.",
    startBalanceLabel: "Starting capital (USD)",
    riskPctLabel: "Risk / trade (% of equity)",
    winRateLabel: "Win rate (%)",
    rewardRiskLabel: "Average winner (R)",
    horizonLabel: "Horizon",
    horizonTrades: (n: number) => `${n} trades`,
    revengeFreqLabel: "Revenge blowups / 20 trades",
    revengeFreqOption: (n: number) => (n === 0 ? "0 blowups (pure discipline)" : `${n} ${n === 1 ? "day" : "days"} (−5R instead of −1R)`),
    patientCardLabel: "PATIENT COMPOUNDING",
    patientCardSub: (pct: number, dd: number) => `${pct >= 0 ? "+" : ""}${pct}% · max drawdown −${dd}%`,
    revengeCardLabel: "SAME SKILL + REVENGE DAYS",
    revengeCardSub: (pct: number, events: number, dd: number) => `${pct >= 0 ? "+" : ""}${pct}% · ${events} blowups · max DD −${dd}%`,
    costCardLabel: "COST OF IMPATIENCE",
    costCardSub: (lift: string) => `Compounding vs. flat $ risk: ${lift}`,
    negativeEdgeNotice: (expR: number) =>
      `At this win rate and payoff, expectancy is ${expR}R per trade. Compounding only amplifies a positive edge—keep risk tiny while refining setups first.`,
    chartAria: (trades: number, patient: string, revenge: string) =>
      `Simulated equity over ${trades} trades: patient compounding ends at ${patient} versus ${revenge} with revenge blowup days.`,
    legendPatient: "Patient % compounding",
    legendRevenge: "With −5R revenge days",
    simTableSummary: "View simulation milestones as a table",
    colTrade: "Trade #",
    colPatient: "Patient equity",
    colRevenge: "With revenge days",
    colFlat: "Flat $ risk",
    simDisclaimer: "Hypothetical illustration using proportional equity sizing—not a forecast or promise. Real trading involves spreads, slippage, taxes, and changing conditions, and never rises in a straight daily line.",
    ddEyebrow: "ASYMMETRY OF LOSS",
    ddTitle: "The math of drawdown recovery",
    ddDesc: "Why stopping at a small red day is the true engine of compounding.",
    ddColLoss: "Account drawdown",
    ddColNeed: "Gain needed to break even",
    ddColWins: (risk: number, rr: number) => `Consecutive wins at ${risk}% × ${rr}R`,
    ddWinsValue: (wins: number) => `${wins} ${wins === 1 ? "win" : "wins"} in a row`,
    lessonsEyebrow: "PERSPECTIVE FOR HARD SESSIONS",
    lessonsTitle: "Grounded lessons for hard days",
    lessonsDesc: "Realistic principles to read when morning profit slips or impatience whispers to double your size.",
    lessons: [
      {
        tag: "01 · THE HALF-PEAK RULE",
        heading: "Keeping +$80 after +$200 is a professional win",
        body: "When morning profit drops from +$200 to +$80, your brain anchors to +$200 and feels robbed. In reality, walking away with +$80 still raises tomorrow’s compounding base—fighting to reclaim the missing $120 is how green days turn deeply negative.",
      },
      {
        tag: "02 · COMPOUNDING ≠ BANK INTEREST",
        heading: "Small red days are already inside the formula",
        body: "Bank interest pays a smooth fixed rate; trading compounds in zig-zags. Demanding a green result every single day creates panic when a normal −1R loss appears. Accepting a planned small red day keeps your base intact for the next clean setup.",
      },
      {
        tag: "03 · VOLATILITY DRAG",
        heading: "Cutting blowups grows capital faster than chasing home runs",
        body: "An account swinging +20% then −20% doesn’t break even—it shrinks to 96% (−4%). Proportional compounding works because position size scales up gradually as equity grows and shrinks automatically during drawdowns, as long as you prevent emotional −15% days.",
      },
      {
        tag: "04 · INDEPENDENT ODDS",
        heading: "The next chart owes nothing to your last trade",
        body: "The market doesn’t know your morning peak or what you lost an hour ago. Trying to make one setup pay back three losses forces oversized risk on tired judgment. Close the platform, protect your nerve, and let 100 calm trades do the heavy lifting.",
      },
    ],
  },
  id: {
    eyebrow: "KESABARAN & EFEK GULUNG",
    heroTitle: "Tenangkan diri sebelum klik berikutnya.",
    heroBody: "Pertumbuhan akun jangka panjang lahir dari menggulung keunggulan kecil secara konsisten—bukan memaksa satu sore yang buruk untuk menebus semuanya sekaligus.",
    langLabel: "Bahasa halaman Patience",
    todayTrades: "Trade hari ini",
    todayPeak: "Puncak P&L hari ini",
    todayCurrent: "Posisi saat ini",
    statusGreenToRed: (peak: string, now: string) =>
      `Hari ini sempat menyentuh ${peak} dan kini di ${now}. Keinginan mengembalikan ${peak} hari ini juga adalah jebakan peak anchoring—berhenti sekarang menyelamatkan modal dasar untuk digulung besok.`,
    statusGiveback: (peak: string, now: string, pct: number) =>
      `Hari ini sempat di puncak ${peak} lalu tergerus ${pct}% menjadi ${now}. Menutup layar dalam keadaan hijau ${now} tetap memperbesar modal gulungan; mengejar angka puncak justru pintu masuk hari minus.`,
    statusLossStreak: (count: number) =>
      `Tercatat ${count} trade hari ini dengan posisi merah. Rugi kecil terukur adalah biaya wajar dalam compounding—berhenti sekarang membuat pemulihan besok tetap ringan.`,
    statusOverCapGreen: (count: number, cap: number, now: string) =>
      `Sudah ${count} trade hari ini (melewati batas nyaman ${cap} trade/hari) pada posisi ${now}. Waspadai house-money effect yang membuat disiplin mengendur saat sedang profit.`,
    statusCalm: "Tugas hari ini bukan menebus rugi kemarin atau mengejar target uang harian—cukup eksekusi setup bersih dengan risiko terukur, atau istirahat.",
    resetEyebrow: "REM DARURAT SAAT EMOSI",
    resetTitle: "Jeda impuls 60 detik",
    resetDesc: "Beri jarak antara dorongan emosi dan klik order berikutnya.",
    startPause: "Mulai jeda 60 dtk",
    pauseTimer: "Jeda waktu",
    resumeTimer: "Lanjutkan",
    resetTimer: "Ulangi",
    doneReset: "Jeda selesai · Mulai lagi",
    breathButton: "Latihan napas",
    timerCueRunning: "Lepas tangan dari mouse/HP · Tarik napas perlahan · Biarkan dorongan balas dendam lewat tanpa dituruti.",
    timerCueDone: "60 detik selesai. Jawab tiga cek kejujuran di bawah sebelum menyentuh chart lagi.",
    timerCueIdle: "Tidak sabar ingin mengembalikan profit yang hilang? Ambil satu menit hening terlebih dahulu.",
    checksHeading: "Tiga cek kejujuran sebelum entry lagi",
    checks: [
      "Setup berikutnya benar-benar tertulis di Playbook saya—bukan dorongan membalas rugi atau mengejar puncak saldo tadi.",
      "Ukuran risiko tetap normal (1R), tidak diperbesar supaya cepat balik modal.",
      "Jika trade berikutnya juga kena stop loss, modal dan pikiran saya tetap tenang untuk besok.",
    ],
    checksAllYes: "Ketiga cek terpenuhi dengan jernih. Jika memang ada setup valid, gunakan risiko normal.",
    checksWait: "Selama belum ketiganya dijawab 'ya' dengan kepala dingin, tidak klik entry adalah keputusan menang.",
    walkEyebrow: "KOMITMEN TUTUP SESI",
    walkTitle: "Tutup sesi hari ini dengan sadar",
    walkDesc: "Catat keputusan berhenti agar menutup chart tepat waktu terasa sebagai kemenangan disiplin.",
    closedBadge: "Sesi hari ini ditutup",
    savedDaysLabel: (count: number) => `${count} hari berhasil menahan diri`,
    reasonLabel: "Alasan saya berhenti hari ini",
    reasons: {
      lock_profit: "Mengunci sisa profit hari ini",
      stop_giveback: "Menghentikan tergerusnya profit puncak",
      respect_loss: "Menerima rugi kecil sesuai rencana",
      protect_focus: "Menjauh saat mulai lelah / emosi",
    } as Record<WalkAwayReason, string>,
    noteLabel: "Catatan singkat untuk diri sendiri (opsional)",
    notePlaceholder: "mis. Pulang bawa sisa profit daripada memaksa ke puncak pagi.",
    saveWalkAway: "Akhiri sesi hari ini",
    updateWalkAway: "Perbarui catatan tutup sesi",
    removeWalkAway: "Batalkan tutup sesi hari ini",
    walkSavedToast: "Sesi hari ini ditutup dengan sadar. Disiplin yang baik.",
    walkRemovedToast: "Catatan tutup sesi hari ini dihapus.",
    walkHonestNote: "Komitmen mandiri di dalam jurnal; Bloom tidak terhubung atau memblokir aplikasi broker.",
    recentWalkHeading: "Riwayat keputusan berhenti tepat waktu",
    noWalkYet: "Belum ada catatan tutup sesi. Berhenti sebelum emosi meledak dicatat sebagai pencapaian di sini.",
    mirrorEyebrow: "CERMIN DATA JURNAL",
    mirrorTitle: "Cermin urutan entry & overtrade",
    mirrorDesc: "Bandingkan hasil entry awal harian melawan entry tambahan pada akun dan tanggal yang sama.",
    capLabel: "Batas nyaman / hari",
    tradesPerDay: (n: number) => `${n} trade / hari`,
    earlyBoxTitle: (cap: number) => (cap === 1 ? "Trade ke-1 tiap hari" : `Trade ke-1 s/d ke-${cap} tiap hari`),
    extraBoxTitle: (cap: number) => `Trade ke-${cap + 1}+ (entry tambahan)`,
    winRateWord: "win rate",
    tradesWord: (n: number) => `${n} trade`,
    stoppedAtCapLabel: (cap: number) => `Seandainya berhenti di #${cap}/hari`,
    actualNetLabel: "Net P&L aktual tercatat",
    mirrorNoExtra: (cap: number) => `Belum ada hari yang melewati ${cap} trade per hari pada tampilan ini.`,
    mirrorExtraCost: (cap: number, loss: string, days: number) =>
      `Dari ${days} hari trading, entry tambahan setelah trade ke-${cap} menggerus total Net P&L sebesar ${loss}.`,
    mirrorExtraGain: (cap: number, gain: string) =>
      `Entry setelah trade ke-${cap} menyumbang ${gain} pada catatan saat ini—tetap pastikan entry sore bukan karena emosi.`,
    mirrorFootnote: "Urutan intraday mengikuti urutan input (entry ID) per akun dan tanggal karena jam eksekusi tidak dicatat. Pola historis tidak menjamin hasil masa depan.",
    givebackEyebrow: "DETEKTOR PROFIT TERGERUS",
    givebackTitle: "Hari profit tergerus & berbalik minus",
    givebackDesc: "Hari ketika saldo harian sempat positif lalu kehilangan ≥50% profit puncak atau berakhir minus.",
    greenToRedStat: "Hari Hijau → Minus",
    heavyGivebackStat: "Giveback ≥50%",
    badgeGreenToRed: "Hijau → Minus",
    badgeGiveback: (pct: number) => `Tergerus ${pct}%`,
    peakReached: (peak: string, num: number) => `Puncak ${peak} di trade #${num}`,
    endedAt: (end: string, drop: string) => `Berakhir ${end} (${drop} dari puncak)`,
    viewDay: "Lihat hari",
    noGivebackDays: "Tidak ada hari hijau-berbalik-minus atau profit tergerus ≥50% pada tampilan ini.",
    simEyebrow: "MODEL PERTUMBUHAN REALISTIS",
    simTitle: "Simulasi compounding realistis vs. hari balas dendam",
    simDesc: "Lihat bagaimana risiko % proporsional menggulung modal—dan bagaimana segelintir hari emosi (−5R) menghapus hasil gulungan berbulan-bulan.",
    useJournalBtn: "Isi dari statistik jurnal",
    journalAppliedR: (wr: number, rr: number) => `Diambil dari trade tampil: win rate ${wr}% · rata-rata ${rr}R (berdasarkan catatan R).`,
    journalAppliedPnl: (wr: number, rr: number) => `Diambil dari trade tampil: win rate ${wr}% · rasio menang/kalah ${rr}×.`,
    journalNeedMore: "Catat minimal 3 trade selesai (minimal 1 menang dan 1 kalah) untuk menarik statistik otomatis.",
    startBalanceLabel: "Modal awal (USD)",
    riskPctLabel: "Risiko / trade (% ekuitas)",
    winRateLabel: "Win rate (%)",
    rewardRiskLabel: "Rata-rata menang (R)",
    horizonLabel: "Horizon",
    horizonTrades: (n: number) => `${n} trade`,
    revengeFreqLabel: "Hari balas dendam / 20 trade",
    revengeFreqOption: (n: number) => (n === 0 ? "0 ledakan (disiplin penuh)" : `${n} hari (−5R akibat tidak mau stop di −1R)`),
    patientCardLabel: "COMPOUNDING SABAR",
    patientCardSub: (pct: number, dd: number) => `${pct >= 0 ? "+" : ""}${pct}% · maks. drawdown −${dd}%`,
    revengeCardLabel: "SKILL SAMA + HARI EMOSI",
    revengeCardSub: (pct: number, events: number, dd: number) => `${pct >= 0 ? "+" : ""}${pct}% · ${events} ledakan · maks. DD −${dd}%`,
    costCardLabel: "HARGA KETIDAKSABARAN",
    costCardSub: (lift: string) => `Efek gulung vs. risiko $ tetap: ${lift}`,
    negativeEdgeNotice: (expR: number) =>
      `Pada kombinasi win rate & R ini, ekspektasi bernilai ${expR}R per trade. Compounding hanya melipatgandakan strategi berekspektasi positif—kecilkan risiko sambil membenahi akurasi setup terlebih dulu.`,
    chartAria: (trades: number, patient: string, revenge: string) =>
      `Simulasi ekuitas selama ${trades} trade: compounding sabar berakhir di ${patient} dibanding ${revenge} dengan hari balas dendam.`,
    legendPatient: "Compounding % sabar",
    legendRevenge: "Dengan hari emosi −5R",
    simTableSummary: "Lihat tabel ringkasan simulasi",
    colTrade: "Trade ke-",
    colPatient: "Ekuitas sabar",
    colRevenge: "Dengan hari emosi",
    colFlat: "Risiko $ tetap",
    simDisclaimer: "Ilustrasi edukasi menggunakan ukuran risiko proporsional (% ekuitas)—bukan janji atau prediksi hasil. Trading nyata memiliki spread, slippage, biaya, serta kurva naik-turun alami.",
    ddEyebrow: "ASIMETRI KERUGIAN",
    ddTitle: "Matematika pemulihan drawdown",
    ddDesc: "Mengapa berani berhenti saat rugi masih kecil adalah bahan bakar utama efek compounding.",
    ddColLoss: "Penurunan modal",
    ddColNeed: "Profit yang dibutuhkan untuk impas",
    ddColWins: (risk: number, rr: number) => `Menang beruntun pada ${risk}% × ${rr}R`,
    ddWinsValue: (wins: number) => `${wins}× menang beruntun`,
    lessonsEyebrow: "PEGANGAN SAAT HARI BERAT",
    lessonsTitle: "Pelajaran realistis saat hari terasa berat",
    lessonsDesc: "Prinsip membumi untuk dibaca ketika profit pagi menyusut atau muncul godaan memperbesar lot demi cepat balik modal.",
    lessons: [
      {
        tag: "01 · ATURAN SISA PROFIT PUNCAK",
        heading: "Pulang membawa +$80 setelah sempat +$200 adalah kemenangan profesional",
        body: "Saat profit turun dari +$200 menjadi +$80, otak terlanjur menganggap +$200 itu milik resmi Anda dan merasa kecurian. Faktanya, berhenti di +$80 tetap memperbesar modal gulungan besok—memaksa mengejar $120 yang hilang hampir selalu berakhir minus.",
      },
      {
        tag: "02 · COMPOUNDING TRADING ≠ BUNGA DEPOSITO",
        heading: "Hari merah kecil sudah dihitung di dalam rumus pertumbuhan",
        body: "Bunga bank naik lurus setiap hari; compounding trading tumbuh secara zig-zag. Menuntut akun wajib hijau setiap hari justru memicu panik saat −1R wajar muncul. Menerima rugi kecil sesuai batas menjaga modal utuh untuk setup berikutnya.",
      },
      {
        tag: "03 · PAJAK VOLATILITAS (VOLATILITY DRAG)",
        heading: "Mencegah hari hancur jauh lebih kuat daripada mengejar profit raksasa",
        body: "Akun yang naik +20% lalu jatuh −20% tidak kembali impas, melainkan menyusut ke 96% (−4%). Metode compounding bekerja karena ukuran 1R ikut membesar saat modal tumbuh dan mengecil otomatis saat turun—selama Anda tidak merusaknya dengan satu hari balas dendam.",
      },
      {
        tag: "04 · PROBABILITAS INDEPENDEN",
        heading: "Setup berikutnya tidak punya kewajiban membayar rugi barusan",
        body: "Pasar tidak peduli berapa puncak saldo Anda pagi tadi. Membebani satu entry untuk menebus tiga kerugian sekaligus hanya melahirkan lot kebesaran saat pikiran lelah. Tutup layar hari ini, jaga ketenangan, dan biarkan 100 trade terukur yang menggulung akun Anda.",
      },
    ],
  },
} as const;

function accountName(accounts: TradingAccount[], id: string, locale: PatienceLocale) {
  if (id === "all") return locale === "id" ? "Semua akun" : "All accounts";
  return accounts.find((account) => account.id === id)?.name ?? (locale === "id" ? "Akun" : "Account");
}

export function PatienceView({
  trades,
  settings,
  accountFilter,
  hidden,
  onBreath,
  onDay,
  onUpdateSettings,
}: {
  trades: Trade[];
  settings: JournalSettings;
  accountFilter: string;
  hidden: boolean;
  onBreath: () => void;
  onDay: (date: string) => void;
  onUpdateSettings: (patch: Partial<JournalSettings>, message?: string) => Promise<boolean>;
}) {
  const [localeOverride, setLocaleOverride] = useState<PatienceLocale | null>(null);
  const locale: PatienceLocale = localeOverride ?? settings.patienceLocale ?? settings.locale ?? "en";
  const t = copy[locale];

  const [capOverride, setCapOverride] = useState<number | null>(null);
  const maxDailyTrades = capOverride ?? settings.patienceMaxTrades ?? 3;

  // 60-second impulse reset state
  const [secondsLeft, setSecondsLeft] = useState(PAUSE_SECONDS);
  const [timerRunning, setTimerRunning] = useState(false);
  const [checks, setChecks] = useState<[boolean, boolean, boolean]>([false, false, false]);

  useEffect(() => {
    if (!timerRunning) return;
    const handle = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(handle);
  }, [timerRunning]);

  const today = todayString();
  const accounts = useMemo(() => settings.accounts ?? [DEFAULT_ACCOUNT], [settings.accounts]);
  const walkAwayLogs = useMemo(
    () => [...(settings.walkAwayLogs ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [settings.walkAwayLogs],
  );
  const todayWalkAway = useMemo(
    () => walkAwayLogs.find((item) => item.date === today && (accountFilter === "all" || item.accountId === accountFilter || item.accountId === "all")) ?? null,
    [walkAwayLogs, today, accountFilter],
  );

  const [walkReason, setWalkReason] = useState<WalkAwayReason>("stop_giveback");
  const [walkNote, setWalkNote] = useState("");
  const [walkEdited, setWalkEdited] = useState(false);

  const effectiveWalkReason = !walkEdited && todayWalkAway ? todayWalkAway.reason : walkReason;
  const effectiveWalkNote = !walkEdited && todayWalkAway ? todayWalkAway.note : walkNote;

  const configuredCapital = useMemo(() => {
    if (accountFilter !== "all") {
      const target = accounts.find((item) => item.id === accountFilter);
      return target?.startingBalance && target.startingBalance > 0 ? target.startingBalance : null;
    }
    const configured = accounts.filter((item) => item.startingBalance && item.startingBalance > 0);
    if (!configured.length) return null;
    return configured.reduce((sum, item) => sum + (item.startingBalance ?? 0), 0);
  }, [accounts, accountFilter]);

  // Realistic compounding simulator state
  const [startingBalanceText, setStartingBalanceText] = useState(() =>
    configuredCapital !== null ? String(configuredCapital) : "5000",
  );
  const [riskPercent, setRiskPercent] = useState(1);
  const [winRateText, setWinRateText] = useState("50");
  const [rewardRiskText, setRewardRiskText] = useState("1.8");
  const [totalTrades, setTotalTrades] = useState(100);
  const [revengeDaysPer20, setRevengeDaysPer20] = useState(2);
  const [presetMessage, setPresetMessage] = useState<string | null>(null);

  const todayPulse = useMemo(() => getTodaySessionPulse(trades, today, maxDailyTrades), [trades, today, maxDailyTrades]);
  const mirror = useMemo(() => getPatienceMirror(trades, maxDailyTrades), [trades, maxDailyTrades]);
  const preset = useMemo(() => getJournalSimPreset(trades), [trades]);

  const parsedStart = Number(startingBalanceText);
  const parsedWinRate = Number(winRateText);
  const parsedRewardRisk = Number(rewardRiskText);

  const sim = useMemo(() => simulateCompoundingComparison({
    startingBalance: Number.isFinite(parsedStart) && parsedStart > 0 ? parsedStart : 5000,
    riskPercent,
    winRate: Number.isFinite(parsedWinRate) ? parsedWinRate : 50,
    rewardRisk: Number.isFinite(parsedRewardRisk) && parsedRewardRisk > 0 ? parsedRewardRisk : 1.8,
    totalTrades,
    revengeDaysPer20,
  }), [parsedStart, riskPercent, parsedWinRate, parsedRewardRisk, totalTrades, revengeDaysPer20]);

  const drawdownRows = useMemo(
    () => getDrawdownRecoveryRows(sim.input.riskPercent, sim.input.rewardRisk),
    [sim.input.riskPercent, sim.input.rewardRisk],
  );

  const milestoneRows = useMemo(() => {
    const step = Math.max(10, Math.round(sim.input.totalTrades / 5));
    return sim.points.filter((point) => point.trade === 0 || point.trade === sim.input.totalTrades || point.trade % step === 0);
  }, [sim]);

  function changeLocale(next: PatienceLocale) {
    setLocaleOverride(next);
    setPresetMessage(null);
    void onUpdateSettings({ patienceLocale: next }).finally(() => setLocaleOverride(null));
  }

  function changeCap(nextCap: number) {
    setCapOverride(nextCap);
    void onUpdateSettings({ patienceMaxTrades: nextCap }).finally(() => setCapOverride(null));
  }

  async function saveTodayWalkAway(event: React.FormEvent) {
    event.preventDefault();
    const targetAccount = accountFilter === "all" ? (accounts.length === 1 ? accounts[0].id : "all") : accountFilter;
    const entry: WalkAwayLog = {
      id: todayWalkAway?.id ?? crypto.randomUUID(),
      date: today,
      accountId: todayWalkAway?.accountId ?? targetAccount,
      reason: effectiveWalkReason,
      note: effectiveWalkNote.trim().slice(0, 240),
    };
    const nextLogs = [
      entry,
      ...(settings.walkAwayLogs ?? []).filter((item) => item.id !== entry.id),
    ].slice(0, 3660);
    const ok = await onUpdateSettings({ walkAwayLogs: nextLogs }, t.walkSavedToast);
    if (ok) setWalkEdited(false);
  }

  async function deleteWalkAway(logId: string, isToday = false) {
    const nextLogs = (settings.walkAwayLogs ?? []).filter((item) => item.id !== logId);
    const ok = await onUpdateSettings({ walkAwayLogs: nextLogs }, isToday ? t.walkRemovedToast : undefined);
    if (ok && isToday) {
      setWalkNote("");
      setWalkEdited(false);
    }
  }

  function applyJournalPreset() {
    if (configuredCapital !== null) {
      setStartingBalanceText(String(configuredCapital));
    }
    if (!preset) {
      setPresetMessage(t.journalNeedMore);
      return;
    }
    setWinRateText(String(preset.winRate));
    setRewardRiskText(String(preset.rewardRisk));
    setPresetMessage(
      preset.source === "r_multiple"
        ? t.journalAppliedR(preset.winRate, preset.rewardRisk)
        : t.journalAppliedPnl(preset.winRate, preset.rewardRisk),
    );
  }

  const allChecked = checks.every(Boolean);
  const statusBannerText = (() => {
    const peakText = currency(todayPulse.intradayPeak, true, hidden);
    const nowText = currency(todayPulse.currentNet, todayPulse.currentNet > 0, hidden);
    if (todayPulse.statusKind === "green_to_red") return t.statusGreenToRed(peakText, nowText);
    if (todayPulse.statusKind === "heavy_giveback") return t.statusGiveback(peakText, nowText, todayPulse.givebackPct);
    if (todayPulse.statusKind === "loss_streak_or_overtrade") return t.statusLossStreak(todayPulse.tradeCount);
    if (todayPulse.statusKind === "over_cap_green") return t.statusOverCapGreen(todayPulse.tradeCount, maxDailyTrades, nowText);
    return t.statusCalm;
  })();

  const statusTone = todayPulse.statusKind === "green_to_red" || todayPulse.statusKind === "loss_streak_or_overtrade"
    ? "alert"
    : todayPulse.statusKind === "heavy_giveback" || todayPulse.statusKind === "over_cap_green"
      ? "caution"
      : "calm";

  return (
    <div className="view-stack patience-view">
      {/* Intro & Today's Live Session Reality Strip */}
      <section className="card patience-intro">
        <div className="patience-intro-top">
          <div className="patience-intro-copy">
            <span className="card-eyebrow"><Sparkles size={13}/> {t.eyebrow}</span>
            <h2>{t.heroTitle}</h2>
            <p>{t.heroBody}</p>
          </div>
          <div className="segment-control patience-lang" role="group" aria-label={t.langLabel}>
            <button type="button" className={locale === "en" ? "selected" : ""} aria-pressed={locale === "en"} onClick={() => changeLocale("en")}>EN</button>
            <button type="button" className={locale === "id" ? "selected" : ""} aria-pressed={locale === "id"} onClick={() => changeLocale("id")}>ID</button>
          </div>
        </div>

        <div className="patience-today-strip">
          <div className="patience-today-metrics">
            <div>
              <small>{t.todayTrades}</small>
              <strong>{todayPulse.tradeCount}</strong>
            </div>
            <div>
              <small>{t.todayPeak}</small>
              <strong className={todayPulse.intradayPeak > 0 ? "positive-text" : ""}>
                {currency(todayPulse.intradayPeak, todayPulse.intradayPeak > 0, hidden)}
              </strong>
            </div>
            <div>
              <small>{t.todayCurrent}</small>
              <strong className={todayPulse.currentNet < 0 ? "loss-text" : todayPulse.currentNet > 0 ? "positive-text" : ""}>
                {currency(todayPulse.currentNet, todayPulse.currentNet > 0, hidden)}
              </strong>
            </div>
          </div>
          <div className={`patience-status-callout ${statusTone}`} role="status">
            {statusTone === "calm" ? <ShieldCheck size={17} aria-hidden="true"/> : <CircleAlert size={17} aria-hidden="true"/>}
            <span>{statusBannerText}</span>
          </div>
        </div>
      </section>

      {/* Module 1: 60-Second Impulse Reset & End Today's Session */}
      <div className="patience-two-col">
        <section className="card patience-card">
          <CardTitle eyebrow={t.resetEyebrow} title={t.resetTitle} description={t.resetDesc} />
          <div className="patience-timer-box">
            <div className="patience-timer-readout">
              <span className="widget-icon green"><Hourglass size={18}/></span>
              <div>
                <strong aria-live="polite" aria-atomic="true">
                  0:{String(secondsLeft).padStart(2, "0")}
                </strong>
                <small>
                  {timerRunning ? t.timerCueRunning : secondsLeft === 0 ? t.timerCueDone : t.timerCueIdle}
                </small>
              </div>
            </div>
            <div
              className="progress-track patience-timer-track"
              role="progressbar"
              aria-label={t.resetTitle}
              aria-valuemin={0}
              aria-valuemax={PAUSE_SECONDS}
              aria-valuenow={PAUSE_SECONDS - secondsLeft}
            >
              <span style={{ width: `${((PAUSE_SECONDS - secondsLeft) / PAUSE_SECONDS) * 100}%` }} />
            </div>
            <div className="patience-timer-actions">
              {secondsLeft === 0 ? (
                <button type="button" className="button-primary" onClick={() => { setSecondsLeft(PAUSE_SECONDS); setTimerRunning(true); }}>
                  <RotateCcw size={15}/> {t.doneReset}
                </button>
              ) : timerRunning ? (
                <button type="button" className="button-primary" onClick={() => setTimerRunning(false)}>
                  <Pause size={15}/> {t.pauseTimer}
                </button>
              ) : (
                <button type="button" className="button-primary" onClick={() => setTimerRunning(true)}>
                  <Play size={15}/> {secondsLeft === PAUSE_SECONDS ? t.startPause : t.resumeTimer}
                </button>
              )}
              {secondsLeft < PAUSE_SECONDS && secondsLeft > 0 && (
                <button type="button" className="button-secondary" onClick={() => { setTimerRunning(false); setSecondsLeft(PAUSE_SECONDS); }}>
                  <RotateCcw size={14}/> {t.resetTimer}
                </button>
              )}
              <button type="button" className="button-secondary" onClick={onBreath}>
                <Wind size={15}/> {t.breathButton}
              </button>
            </div>
          </div>

          <div className="patience-checks">
            <strong>{t.checksHeading}</strong>
            <div className="patience-check-list">
              {t.checks.map((label, index) => (
                <button
                  type="button"
                  key={label}
                  className={`rule-toggle patience-check-item ${checks[index] ? "checked" : ""}`}
                  aria-pressed={checks[index]}
                  onClick={() => setChecks((prev) => prev.map((item, idx) => (idx === index ? !item : item)) as [boolean, boolean, boolean])}
                >
                  <span>{checks[index] && <Check size={13}/>}</span>
                  {label}
                </button>
              ))}
            </div>
            <p className={`patience-check-verdict ${allChecked ? "ready" : ""}`}>
              <CheckCircle2 size={15} aria-hidden="true"/>
              <span>{allChecked ? t.checksAllYes : t.checksWait}</span>
            </p>
          </div>
        </section>

        <section className="card patience-card">
          <CardTitle
            eyebrow={t.walkEyebrow}
            title={t.walkTitle}
            description={t.walkDesc}
            action={<span className="patience-saved-pill"><HeartHandshake size={14}/> {t.savedDaysLabel(walkAwayLogs.length)}</span>}
          />
          {todayWalkAway && (
            <div className="patience-closed-banner" role="status">
              <CheckCircle2 size={16} aria-hidden="true"/>
              <div>
                <strong>{t.closedBadge}</strong>
                <span>{t.reasons[todayWalkAway.reason]}{todayWalkAway.note ? ` · ${todayWalkAway.note}` : ""}</span>
              </div>
            </div>
          )}
          <form className="patience-walk-form" onSubmit={(event) => void saveTodayWalkAway(event)}>
            <label>
              <span>{t.reasonLabel}</span>
              <select
                value={effectiveWalkReason}
                onChange={(event) => { setWalkReason(event.target.value as WalkAwayReason); setWalkEdited(true); }}
              >
                {(Object.keys(t.reasons) as WalkAwayReason[]).map((reasonKey) => (
                  <option key={reasonKey} value={reasonKey}>{t.reasons[reasonKey]}</option>
                ))}
              </select>
            </label>
            <label>
              <span>{t.noteLabel}</span>
              <input
                type="text"
                maxLength={240}
                value={effectiveWalkNote}
                onChange={(event) => { setWalkNote(event.target.value); setWalkEdited(true); }}
                placeholder={t.notePlaceholder}
              />
            </label>
            <div className="patience-walk-actions">
              <button type="submit" className="button-primary">
                <ShieldCheck size={15}/> {todayWalkAway ? t.updateWalkAway : t.saveWalkAway}
              </button>
              {todayWalkAway && (
                <button type="button" className="button-quiet" onClick={() => void deleteWalkAway(todayWalkAway.id, true)}>
                  {t.removeWalkAway}
                </button>
              )}
            </div>
          </form>
          <p className="review-footnote">{t.walkHonestNote}</p>

          <div className="patience-walk-history">
            <strong>{t.recentWalkHeading}</strong>
            {walkAwayLogs.length > 0 ? (
              <ul className="patience-walk-list">
                {walkAwayLogs.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{shortDate(item.date, true)} · {t.reasons[item.reason]}</strong>
                      <small>
                        {accounts.length > 1 || item.accountId === "all" ? `${accountName(accounts, item.accountId, locale)}${item.note ? " · " : ""}` : ""}
                        {item.note}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove walk-away log from ${shortDate(item.date, true)}`}
                      onClick={() => void deleteWalkAway(item.id, item.id === todayWalkAway?.id)}
                    >
                      <Trash2 size={14}/>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="simple-empty">{t.noWalkYet}</div>
            )}
          </div>
        </section>
      </div>

      {/* Module 2: Journal Data Mirror — Sequence Overtrade & Profit Giveback */}
      <div className="patience-two-col">
        <section className="card patience-card">
          <CardTitle
            eyebrow={t.mirrorEyebrow}
            title={t.mirrorTitle}
            description={t.mirrorDesc}
            action={
              <label className="patience-cap-select">
                <span>{t.capLabel}</span>
                <select
                  aria-label={t.capLabel}
                  value={maxDailyTrades}
                  onChange={(event) => changeCap(Number(event.target.value))}
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{t.tradesPerDay(n)}</option>
                  ))}
                </select>
              </label>
            }
          />
          <div className="patience-bucket-grid">
            <div className="patience-bucket">
              <small>{t.earlyBoxTitle(maxDailyTrades)}</small>
              <strong className={mirror.withinCap.net < 0 ? "loss-text" : mirror.withinCap.net > 0 ? "positive-text" : ""}>
                {currency(mirror.withinCap.net, mirror.withinCap.net > 0, hidden)}
              </strong>
              <span>
                {t.tradesWord(mirror.withinCap.count)} · {mirror.withinCap.winRate === null ? "—" : `${mirror.withinCap.winRate}%`} {t.winRateWord}
              </span>
            </div>
            <div className="patience-bucket">
              <small>{t.extraBoxTitle(maxDailyTrades)}</small>
              <strong className={mirror.overCap.net < 0 ? "loss-text" : mirror.overCap.net > 0 ? "positive-text" : ""}>
                {currency(mirror.overCap.net, mirror.overCap.net > 0, hidden)}
              </strong>
              <span>
                {t.tradesWord(mirror.overCap.count)} · {mirror.overCap.winRate === null ? "—" : `${mirror.overCap.winRate}%`} {t.winRateWord}
              </span>
            </div>
          </div>

          <div className="patience-whatif">
            <div className="patience-whatif-numbers">
              <div>
                <small>{t.stoppedAtCapLabel(maxDailyTrades)}</small>
                <strong className={mirror.stoppedAtCapNet < 0 ? "loss-text" : mirror.stoppedAtCapNet > 0 ? "positive-text" : ""}>
                  {currency(mirror.stoppedAtCapNet, mirror.stoppedAtCapNet > 0, hidden)}
                </strong>
              </div>
              <div>
                <small>{t.actualNetLabel}</small>
                <strong className={mirror.actualNet < 0 ? "loss-text" : mirror.actualNet > 0 ? "positive-text" : ""}>
                  {currency(mirror.actualNet, mirror.actualNet > 0, hidden)}
                </strong>
              </div>
            </div>
            <p>
              {mirror.overCap.count === 0
                ? t.mirrorNoExtra(maxDailyTrades)
                : mirror.overCapNet < 0
                  ? t.mirrorExtraCost(maxDailyTrades, currency(Math.abs(mirror.overCapNet), false, hidden), mirror.totalSessions)
                  : t.mirrorExtraGain(maxDailyTrades, currency(mirror.overCapNet, mirror.overCapNet > 0, hidden))}
            </p>
          </div>
          <p className="review-footnote">{t.mirrorFootnote}</p>
        </section>

        <section className="card patience-card">
          <CardTitle eyebrow={t.givebackEyebrow} title={t.givebackTitle} description={t.givebackDesc} />
          <div className="risk-metrics patience-giveback-stats">
            <div>
              <small>{t.greenToRedStat}</small>
              <strong className={mirror.greenToRedCount > 0 ? "loss-text" : ""}>{mirror.greenToRedCount}</strong>
            </div>
            <div>
              <small>{t.heavyGivebackStat}</small>
              <strong>{mirror.heavyGivebackCount}</strong>
            </div>
          </div>

          {mirror.givebackDays.length > 0 ? (
            <ul className="patience-giveback-list">
              {mirror.givebackDays.slice(0, 6).map((session) => (
                <li key={`${session.accountId}-${session.date}`}>
                  <div className="patience-giveback-info">
                    <div className="patience-giveback-top">
                      <strong>{shortDate(session.date, true)}</strong>
                      {accounts.length > 1 && <small>{accountName(accounts, session.accountId, locale)}</small>}
                      <span className={`result-pill ${session.kind === "green_to_red" ? "loss" : "even"}`}>
                        <span />
                        {session.kind === "green_to_red" ? t.badgeGreenToRed : t.badgeGiveback(session.givebackPct)}
                      </span>
                    </div>
                    <small>
                      {t.peakReached(currency(session.peakPnl, true, hidden), session.peakAtTradeNumber)} ·{" "}
                      {t.endedAt(currency(session.finalPnl, session.finalPnl > 0, hidden), currency(-session.givebackPnl, false, hidden))}
                    </small>
                  </div>
                  <button type="button" className="text-link" onClick={() => onDay(session.date)}>
                    {t.viewDay} <ArrowRight size={13}/>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="simple-empty">{t.noGivebackDays}</div>
          )}
        </section>
      </div>

      {/* Module 3a: Realistic Compounding vs. Revenge Days Simulator */}
      <section className="card patience-card patience-sim-card">
        <CardTitle
          eyebrow={t.simEyebrow}
          title={t.simTitle}
          description={t.simDesc}
          action={
            <button type="button" className="button-secondary" onClick={applyJournalPreset}>
              <TrendingUp size={15}/> {t.useJournalBtn}
            </button>
          }
        />
        {presetMessage && <p className="patience-preset-note" role="status">{presetMessage}</p>}

        <div className="patience-sim-controls">
          <label>
            <span>{t.startBalanceLabel}</span>
            <input
              type="number"
              inputMode="decimal"
              min={100}
              max={10000000}
              step={100}
              value={startingBalanceText}
              onChange={(event) => setStartingBalanceText(event.target.value)}
            />
          </label>
          <label>
            <span>{t.riskPctLabel}</span>
            <select value={riskPercent} onChange={(event) => setRiskPercent(Number(event.target.value))}>
              {[0.5, 1, 1.5, 2, 2.5].map((pct) => (
                <option key={pct} value={pct}>{pct}%</option>
              ))}
            </select>
          </label>
          <label>
            <span>{t.winRateLabel}</span>
            <input
              type="number"
              inputMode="numeric"
              min={20}
              max={80}
              step={1}
              value={winRateText}
              onChange={(event) => setWinRateText(event.target.value)}
            />
          </label>
          <label>
            <span>{t.rewardRiskLabel}</span>
            <input
              type="number"
              inputMode="decimal"
              min={0.8}
              max={4}
              step={0.1}
              value={rewardRiskText}
              onChange={(event) => setRewardRiskText(event.target.value)}
            />
          </label>
          <label>
            <span>{t.horizonLabel}</span>
            <select value={totalTrades} onChange={(event) => setTotalTrades(Number(event.target.value))}>
              {[60, 100, 150].map((count) => (
                <option key={count} value={count}>{t.horizonTrades(count)}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{t.revengeFreqLabel}</span>
            <select value={revengeDaysPer20} onChange={(event) => setRevengeDaysPer20(Number(event.target.value))}>
              {[0, 1, 2, 3].map((freq) => (
                <option key={freq} value={freq}>{t.revengeFreqOption(freq)}</option>
              ))}
            </select>
          </label>
        </div>

        {sim.expectancyR <= 0 && (
          <div className="patience-edge-warning" role="status">
            <CircleAlert size={16} aria-hidden="true"/>
            <span>{t.negativeEdgeNotice(sim.expectancyR)}</span>
          </div>
        )}

        <div className="patience-sim-summary">
          <article className="patience-sim-stat patient">
            <small>{t.patientCardLabel}</small>
            <strong className={sim.patientFinal >= sim.input.startingBalance ? "positive-text" : "loss-text"}>
              {currency(sim.patientFinal)}
            </strong>
            <span>{t.patientCardSub(sim.patientGainPct, sim.patientMaxDrawdownPct)}</span>
          </article>
          <article className="patience-sim-stat revenge">
            <small>{t.revengeCardLabel}</small>
            <strong className={sim.revengeFinal < sim.input.startingBalance ? "loss-text" : ""}>
              {currency(sim.revengeFinal)}
            </strong>
            <span>{t.revengeCardSub(sim.revengeGainPct, sim.revengeEventsTriggered, sim.revengeMaxDrawdownPct)}</span>
          </article>
          <article className="patience-sim-stat cost">
            <small>{t.costCardLabel}</small>
            <strong className={sim.impatienceCost > 0 ? "loss-text" : ""}>
              {sim.impatienceCost > 0 ? `−${currency(sim.impatienceCost)}` : currency(0)}
            </strong>
            <span>{t.costCardSub(currency(sim.compoundingLift, sim.compoundingLift > 0))}</span>
          </article>
        </div>

        <div className="patience-legend">
          <span><i className="dot-patient"/> {t.legendPatient}</span>
          <span><i className="dot-revenge"/> {t.legendRevenge}</span>
        </div>

        <div
          className="chart-wrap patience-chart-wrap"
          role="img"
          aria-label={t.chartAria(sim.input.totalTrades, currency(sim.patientFinal), currency(sim.revengeFinal))}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sim.points} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="patience-patient-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-line)" stopOpacity={0.28}/>
                  <stop offset="95%" stopColor="var(--chart-line)" stopOpacity={0.02}/>
                </linearGradient>
                <linearGradient id="patience-revenge-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--loss)" stopOpacity={0.18}/>
                  <stop offset="95%" stopColor="var(--loss)" stopOpacity={0.01}/>
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 5" />
              <XAxis
                dataKey="trade"
                axisLine={false}
                tickLine={false}
                minTickGap={28}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                dy={8}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tickFormatter={(value: number) => compactCurrency(value, false)}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                width={64}
                domain={["auto", "auto"]}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0].payload as { trade: number; patient: number; revenge: number; revengeEvent: boolean };
                  return (
                    <div className="chart-tooltip">
                      <strong>{t.colTrade}{point.trade}</strong>
                      <span>{t.legendPatient}: {currency(point.patient)}</span>
                      <small>{t.legendRevenge}: {currency(point.revenge)}{point.revengeEvent ? " · −5R" : ""}</small>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="patient"
                stroke="var(--chart-line)"
                strokeWidth={2.5}
                fill="url(#patience-patient-fill)"
                activeDot={{ r: 5, fill: "var(--chart-line)", stroke: "var(--surface)", strokeWidth: 3 }}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="revenge"
                stroke="var(--loss)"
                strokeWidth={2}
                strokeDasharray="5 4"
                fill="url(#patience-revenge-fill)"
                activeDot={{ r: 4, fill: "var(--loss)", stroke: "var(--surface)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <details className="chart-data">
          <summary>{t.simTableSummary}</summary>
          <div>
            <table>
              <thead>
                <tr>
                  <th>{t.colTrade}</th>
                  <th>{t.colPatient}</th>
                  <th>{t.colRevenge}</th>
                  <th>{t.colFlat}</th>
                </tr>
              </thead>
              <tbody>
                {milestoneRows.map((row) => (
                  <tr key={row.trade}>
                    <td>{row.trade}</td>
                    <td>{currency(row.patient)}</td>
                    <td>{currency(row.revenge)}</td>
                    <td>{currency(row.flat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <p className="metric-disclaimer">{t.simDisclaimer}</p>
      </section>

      {/* Module 3b: Asymmetric Drawdown Recovery Math */}
      <section className="card patience-card">
        <CardTitle eyebrow={t.ddEyebrow} title={t.ddTitle} description={t.ddDesc} />
        <div className="patience-dd-table" role="table" aria-label={t.ddTitle}>
          <div className="patience-dd-head" role="row">
            <span role="columnheader">{t.ddColLoss}</span>
            <span role="columnheader">{t.ddColNeed}</span>
            <span role="columnheader">{t.ddColWins(sim.input.riskPercent, sim.input.rewardRisk)}</span>
          </div>
          {drawdownRows.map((row) => (
            <div className="patience-dd-row" role="row" key={row.lossPct}>
              <div role="cell" className="patience-dd-loss">
                <strong className="loss-text">−{row.lossPct}%</strong>
              </div>
              <div role="cell" className="patience-dd-barcell">
                <div className="patience-dd-label">
                  <strong>+{row.recoveryPct.toFixed(row.recoveryPct % 1 === 0 ? 0 : 2)}%</strong>
                </div>
                <div className="breakdown-track">
                  <span style={{ width: `${Math.min(100, row.recoveryPct)}%` }} />
                </div>
              </div>
              <div role="cell" className="patience-dd-wins">
                <span><Flame size={13} aria-hidden="true"/> {t.ddWinsValue(row.winsToRecover)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Module 4: 4 Grounded Compounding Lessons */}
      <section className="card patience-card">
        <CardTitle eyebrow={t.lessonsEyebrow} title={t.lessonsTitle} description={t.lessonsDesc} />
        <div className="patience-lessons-grid">
          {t.lessons.map((lesson) => (
            <article className="patience-lesson" key={lesson.tag}>
              <span className="card-eyebrow"><Compass size={13}/> {lesson.tag}</span>
              <h3>{lesson.heading}</h3>
              <p>{lesson.body}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
