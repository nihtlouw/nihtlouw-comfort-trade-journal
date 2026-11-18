"use client";

/**
 * Performance chart.
 *
 * Extracted from `journal-ui.tsx` so the recharts dependency (roughly 700 KB of
 * untranspiled JavaScript, ~240 KB gzip) is no longer pulled into every consumer
 * of `journal-ui` — the trade table, calendar, review and lightbox all import
 * that module. `journal-views.tsx` now loads this file with `next/dynamic`, so
 * the chart arrives as its own chunk when the Overview or Analytics view mounts
 * instead of blocking the initial journal payload.
 */
import { useId, useMemo, useRef, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import type { AppLocale, Trade } from "@/lib/types";
import {
  calendarDayCurrency,
  compactCurrency,
  compactRMultiple,
  currency,
  formatRMultiple,
  getStats,
  shortDate,
  todayString,
  type Period,
} from "@/lib/format";
import { monthGrid, monthTitle, performanceSeries, type ChartPoint } from "@/lib/analytics";
import { UI_COPY } from "@/lib/i18n";
import { CardTitle, PeriodControl } from "@/components/journal-ui";

type ChartUnit = "usd" | "r";

export function PerformanceChart({
  trades,
  period,
  onPeriodChange,
  hidden,
  compact = false,
  locale = "en",
  onSelectDay,
}: {
  trades: Trade[];
  period: Period;
  onPeriodChange: (period: Period) => void;
  hidden: boolean;
  compact?: boolean;
  locale?: AppLocale;
  onSelectDay?: (date: string) => void;
}) {
  const copy = UI_COPY[locale];
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [unit, setUnit] = useState<ChartUnit>("usd");
  const drillCooldownRef = useRef(false);

  const data = useMemo(() => performanceSeries(trades, period), [trades, period]);
  const stats = getStats(trades);
  const totalCumR = data.at(-1)?.cumR ?? 0;
  const totalRTrades = useMemo(() => data.reduce((sum, p) => sum + p.rTrades, 0), [data]);

  const isR = unit === "r";
  const netVal = isR ? totalCumR : stats.net;
  const isNegative = netVal < 0;

  const cumKey: "pnl" | "cumR" = isR ? "cumR" : "pnl";
  const dailyKey: "daily" | "dailyR" = isR ? "dailyR" : "daily";

  // Dynamic split-zero gradient offset so dips below 0 turn coral while gains stay sage/emerald
  const { minCum, maxCum, zeroOffset, safeMaxDaily } = useMemo(() => {
    let lo = 0;
    let hi = 0;
    let maxDaily = 0;
    for (const pt of data) {
      const c = pt[cumKey];
      if (c < lo) lo = c;
      if (c > hi) hi = c;
      if (pt.trades > 0) {
        const d = Math.abs(pt[dailyKey]);
        if (d > maxDaily) maxDaily = d;
      }
    }
    const offset = hi <= 0 ? 0 : lo >= 0 ? 1 : hi / (hi - lo);
    return {
      minCum: lo,
      maxCum: hi,
      zeroOffset: Math.max(0, Math.min(1, offset)),
      safeMaxDaily: maxDaily > 0 ? maxDaily : 1,
    };
  }, [cumKey, dailyKey, data]);

  // Summary chips: Best & Worst active trading day (or Peak High-Water Mark)
  const summaryMeta = useMemo(() => {
    const active = data.filter((p) => (isR ? p.rTrades > 0 : p.trades > 0));
    if (!active.length) return { best: null as number | null, worst: null as number | null, peak: 0 };
    let best = -Infinity;
    let worst = Infinity;
    for (const p of active) {
      const v = p[dailyKey];
      if (v > best) best = v;
      if (v < worst) worst = v;
    }
    const peak = isR ? Math.max(0, ...data.map((d) => d.peakR)) : Math.max(0, ...data.map((d) => d.peak));
    return {
      best: Number.isFinite(best) ? best : null,
      worst: Number.isFinite(worst) ? worst : null,
      peak,
    };
  }, [dailyKey, data, isR]);

  const startTime = data[0]?.time || 0;
  const endTime = data.at(-1)?.time || startTime;
  const ticks = [
    ...new Set(
      Array.from(
        { length: 5 },
        (_, index) => startTime + Math.round(((endTime - startTime) * index) / 4 / 86_400_000) * 86_400_000,
      ),
    ),
  ];
  const intlTag = locale === "id" ? "id-ID" : "en-US";
  const barWidth = Math.max(5, Math.min(13, Math.floor(420 / Math.max(data.length, 6))));

  const areaGradId = `pnl-split-area-${uid}`;
  const strokeGradId = `pnl-split-stroke-${uid}`;

  function triggerDayDrilldown(point: ChartPoint | undefined) {
    if (!onSelectDay || !point || point.trades <= 0 || drillCooldownRef.current) return;
    drillCooldownRef.current = true;
    window.setTimeout(() => {
      drillCooldownRef.current = false;
    }, 150);
    onSelectDay(point.date);
  }

  const headlineValue = isR
    ? formatRMultiple(totalCumR)
    : currency(stats.net, stats.net > 0, hidden);

  const fmtVal = (v: number, signed = true) =>
    isR ? formatRMultiple(v) : currency(v, signed && v > 0, hidden);

  return (
    <section className={`card performance-card ${compact ? "compact-chart" : ""}`}>
      <CardTitle
        title={copy.perfTitle}
        description={copy.perfDesc}
        action={
          <div className="chart-header-controls">
            <div className="segment-control chart-unit-toggle" role="group" aria-label={copy.chartUnitAria}>
              <button
                type="button"
                className={!isR ? "selected" : ""}
                aria-pressed={!isR}
                onClick={() => setUnit("usd")}
              >
                $
              </button>
              <button
                type="button"
                className={isR ? "selected" : ""}
                aria-pressed={isR}
                onClick={() => setUnit("r")}
              >
                R
              </button>
            </div>
            <PeriodControl value={period} onChange={onPeriodChange} locale={locale} />
          </div>
        }
      />

      <div className="chart-headline-wrap">
        <div className="chart-headline">
          <strong className={isNegative ? "loss-text" : ""}>{headlineValue}</strong>
          <span>
            <i className={isNegative ? "loss-dot" : ""} /> {isR ? copy.cumNetR : copy.cumNetPnl}
          </span>
        </div>

        {trades.length > 0 && (
          <div className="chart-kpi-pills">
            {!isR && totalRTrades > 0 && (
              <button
                type="button"
                className={`chart-kpi-chip is-interactive ${totalCumR < 0 ? "is-loss" : ""}`}
                onClick={() => setUnit("r")}
              >
                {copy.chartCumRChip(formatRMultiple(totalCumR))}
              </button>
            )}
            {isR && (
              <button
                type="button"
                className={`chart-kpi-chip is-interactive ${stats.net < 0 ? "is-loss" : ""}`}
                onClick={() => setUnit("usd")}
              >
                {currency(stats.net, stats.net > 0, hidden)}
              </button>
            )}
            {summaryMeta.best !== null && summaryMeta.worst !== null && summaryMeta.best !== summaryMeta.worst ? (
              <span className="chart-kpi-chip is-neutral">
                {copy.chartBestWorstChip(fmtVal(summaryMeta.best), fmtVal(summaryMeta.worst))}
              </span>
            ) : (
              summaryMeta.peak > 0 && (
                <span className="chart-kpi-chip is-neutral">
                  {copy.chartPeakChip(fmtVal(summaryMeta.peak))}
                </span>
              )
            )}
          </div>
        )}
      </div>

      {isR && trades.length > 0 && totalRTrades === 0 && (
        <p className="chart-r-empty-note">{copy.chartNoRiskNote}</p>
      )}

      {trades.length ? (
        <div
          className={`chart-wrap ${onSelectDay ? "is-clickable-chart" : ""}`}
          key={`${period}-${unit}`}
          role="img"
          aria-label={`Cumulative realized ${isR ? "R-multiple" : "P and L"} for ${trades.length} trades: ${hidden && !isR ? "amount hidden" : headlineValue}. The chart starts at zero for the selected period.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 10, right: 8, left: -16, bottom: 0 }}
              onClick={(state) => {
                const s = state as { activeLabel?: number | string; activeTooltipIndex?: number } | null;
                if (!s) return;
                const byTime =
                  typeof s.activeLabel === "number"
                    ? data.find((d) => d.time === s.activeLabel)
                    : undefined;
                const byIdx =
                  typeof s.activeTooltipIndex === "number" ? data[s.activeTooltipIndex] : undefined;
                triggerDayDrilldown(byTime ?? byIdx);
              }}
            >
              <defs>
                <linearGradient id={areaGradId} x1="0" y1="0" x2="0" y2="1">
                  {zeroOffset > 0 && (
                    <>
                      <stop offset="0%" stopColor="var(--chart-glow-top)" stopOpacity={0.38} />
                      <stop
                        offset={`${(zeroOffset * 52).toFixed(1)}%`}
                        stopColor="var(--chart-glow-mid)"
                        stopOpacity={0.15}
                      />
                      <stop
                        offset={`${(zeroOffset * 100).toFixed(1)}%`}
                        stopColor="var(--chart-line)"
                        stopOpacity={minCum < 0 ? 0.04 : 0.01}
                      />
                    </>
                  )}
                  {zeroOffset < 1 && (
                    <>
                      <stop
                        offset={`${(zeroOffset * 100).toFixed(1)}%`}
                        stopColor="var(--loss)"
                        stopOpacity={maxCum > 0 ? 0.06 : 0.28}
                      />
                      <stop
                        offset={`${((zeroOffset + (1 - zeroOffset) * 0.55) * 100).toFixed(1)}%`}
                        stopColor="var(--loss)"
                        stopOpacity={0.14}
                      />
                      <stop offset="100%" stopColor="var(--loss)" stopOpacity={maxCum > 0 ? 0.28 : 0.02} />
                    </>
                  )}
                </linearGradient>
                <linearGradient id={strokeGradId} x1="0" y1="0" x2="0" y2="1">
                  {zeroOffset > 0 && (
                    <>
                      <stop offset="0%" stopColor="var(--chart-stroke-start)" />
                      <stop offset={`${(zeroOffset * 55).toFixed(1)}%`} stopColor="var(--chart-line)" />
                      <stop offset={`${(zeroOffset * 100).toFixed(1)}%`} stopColor="var(--chart-stroke-end)" />
                    </>
                  )}
                  {zeroOffset < 1 && (
                    <>
                      <stop offset={`${(zeroOffset * 100).toFixed(1)}%`} stopColor="var(--loss)" />
                      <stop
                        offset={`${((zeroOffset + (1 - zeroOffset) * 0.5) * 100).toFixed(1)}%`}
                        stopColor="var(--loss)"
                      />
                      <stop offset="100%" stopColor="var(--chart-loss-end)" />
                    </>
                  )}
                </linearGradient>
              </defs>

              <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 5" />
              <XAxis
                dataKey="time"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                padding={{ left: 10, right: 10 }}
                ticks={ticks}
                tickFormatter={(value: number) =>
                  new Date(value).toLocaleDateString(intlTag, {
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })
                }
                axisLine={false}
                tickLine={false}
                minTickGap={30}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                dy={10}
              />
              <YAxis
                yAxisId="cum"
                axisLine={false}
                tickLine={false}
                tickFormatter={(value: number) =>
                  isR ? compactRMultiple(value) : compactCurrency(value, hidden)
                }
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                width={64}
                domain={["auto", "auto"]}
              />
              <YAxis
                yAxisId="daily"
                hide
                domain={[-safeMaxDaily * 1.15, safeMaxDaily * 3.85]}
              />
              <ReferenceLine
                yAxisId="cum"
                y={0}
                stroke="var(--chart-zero-line)"
                strokeDasharray="4 4"
                strokeWidth={1.15}
              />

              <Tooltip
                cursor={{ stroke: "var(--chart-cursor)", strokeDasharray: "3 3", strokeWidth: 1.1 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0].payload as ChartPoint;
                  const cumDisplay = isR
                    ? formatRMultiple(point.cumR)
                    : currency(point.pnl, point.pnl > 0, hidden);
                  const secondaryCum =
                    !isR && totalRTrades > 0
                      ? ` (${formatRMultiple(point.cumR)})`
                      : isR
                        ? ` (${currency(point.pnl, point.pnl > 0, hidden)})`
                        : "";
                  const dayVal = isR ? point.dailyR : point.daily;
                  const dayDisplay = isR
                    ? formatRMultiple(point.dailyR)
                    : currency(point.daily, point.daily > 0, hidden);
                  const curCum = isR ? point.cumR : point.pnl;
                  const curPeak = isR ? point.peakR : point.peak;
                  const curDd = isR ? point.drawdownR : point.drawdown;
                  const isAtPeak = point.trades > 0 && curCum > 0 && Math.abs(curCum - curPeak) < 1e-6;

                  return (
                    <div className="chart-tooltip chart-tooltip-pro">
                      <div className="chart-tooltip-top">
                        <strong>{shortDate(point.date, true, locale)}</strong>
                        <span>
                          {point.trades > 0
                            ? copy.chartTooltipTradesBreakdown(point.trades, point.wins, point.losses)
                            : copy.chartTooltipNoTrades}
                        </span>
                      </div>
                      <div className="chart-tooltip-cum">
                        {copy.tooltipCumulative}: <b>{cumDisplay}</b>
                        {secondaryCum && <em>{secondaryCum}</em>}
                      </div>
                      {point.trades > 0 && (
                        <div className="chart-tooltip-day">
                          <span className={dayVal > 0 ? "is-win" : dayVal < 0 ? "is-loss" : ""}>
                            {copy.chartTooltipDayRow(dayDisplay)}
                          </span>
                          {isAtPeak ? (
                            <i className="chart-tooltip-peak">{copy.chartPeakTag}</i>
                          ) : curDd < 0 ? (
                            <i className="chart-tooltip-dd">{copy.chartDrawdownTag(fmtVal(curDd, false))}</i>
                          ) : null}
                        </div>
                      )}
                      {onSelectDay && point.trades > 0 && (
                        <small className="chart-tooltip-cue">{copy.chartTooltipClickCue}</small>
                      )}
                    </div>
                  );
                }}
              />

              <Bar
                yAxisId="daily"
                dataKey={dailyKey}
                barSize={barWidth}
                isAnimationActive={false}
                shape={(rawProps: unknown) => {
                  const p = rawProps as {
                    x?: number;
                    y?: number;
                    width?: number;
                    height?: number;
                    payload?: ChartPoint;
                  };
                  const pt = p.payload;
                  if (!pt || (isR ? pt.rTrades <= 0 : pt.trades <= 0)) return <g />;
                  const rawH = p.height ?? 0;
                  const rawY = p.y ?? 0;
                  const h = Math.max(2.5, Math.abs(rawH));
                  const topY = rawH < 0 ? rawY + rawH : rawY;
                  const val = pt[dailyKey];
                  const fill = val >= 0 ? "var(--chart-bar-win)" : "var(--chart-bar-loss)";
                  return (
                    <rect
                      x={p.x ?? 0}
                      y={topY}
                      width={Math.max(3, p.width ?? barWidth)}
                      height={h}
                      rx={2.5}
                      ry={2.5}
                      fill={fill}
                      style={{ cursor: onSelectDay ? "pointer" : "default" }}
                      onClick={() => triggerDayDrilldown(pt)}
                    />
                  );
                }}
              />

              <Area
                yAxisId="cum"
                type="monotone"
                dataKey={cumKey}
                stroke={`url(#${strokeGradId})`}
                strokeWidth={2.7}
                fill={`url(#${areaGradId})`}
                activeDot={(dotProps: unknown) => {
                  const dp = dotProps as { cx?: number; cy?: number; payload?: ChartPoint };
                  if (typeof dp.cx !== "number" || typeof dp.cy !== "number") return <g />;
                  const pt = dp.payload;
                  const val = pt ? pt[cumKey] : 0;
                  const fill = val < 0 ? "var(--loss)" : "var(--chart-line)";
                  return (
                    <circle
                      cx={dp.cx}
                      cy={dp.cy}
                      r={5.2}
                      fill={fill}
                      stroke="var(--surface)"
                      strokeWidth={2.8}
                      style={{ cursor: onSelectDay && pt && pt.trades > 0 ? "pointer" : "default" }}
                      onClick={() => triggerDayDrilldown(pt)}
                    />
                  );
                }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="chart-empty">
          <span>
            <TrendingUp size={20} />
          </span>
          <strong>{copy.noChartTitle}</strong>
        </div>
      )}

      {trades.length > 0 && (
        <details className="chart-data">
          <summary>{copy.viewChartTable}</summary>
          <div>
            <table>
              <thead>
                <tr>
                  <th>{copy.colDate}</th>
                  <th>{copy.colTrades}</th>
                  <th>{isR ? copy.colDailyR : copy.colDailyPnl}</th>
                  <th>{isR ? copy.colCumulativeR : copy.colCumulative}</th>
                </tr>
              </thead>
              <tbody>
                {data.slice(-60).map((point) => (
                  <tr key={point.date}>
                    <td>
                      {onSelectDay && point.trades > 0 ? (
                        <button
                          type="button"
                          className="chart-table-day-btn"
                          onClick={() => onSelectDay(point.date)}
                        >
                          {shortDate(point.date, true, locale)}
                        </button>
                      ) : (
                        shortDate(point.date, true, locale)
                      )}
                    </td>
                    <td>{point.trades}</td>
                    <td>
                      {isR
                        ? formatRMultiple(point.dailyR)
                        : currency(point.daily, point.daily > 0, hidden)}
                    </td>
                    <td>
                      {isR
                        ? formatRMultiple(point.cumR)
                        : currency(point.pnl, point.pnl > 0, hidden)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}


