"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";

import { useTheme } from "@/components/ThemeProvider";
import { useLocale } from "@/components/LocaleProvider";
import type { Candle, Trade, TradeSetup } from "@/lib/types";

type Props = {
  candles: Candle[];
  trades: Trade[];
  /** When set, draw OB / liquidity / SCM / SL-TP for that trade. */
  selectedTrade?: Trade | null;
};

function toUtcSeconds(iso: string): UTCTimestamp {
  return Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;
}

function num(v: string | number): number {
  return typeof v === "number" ? v : Number(v);
}

/** Snap an ISO time onto the candle bar that contains it (HTF chart + LTF entries). */
function snapTime(
  iso: string,
  barTimes: number[],
  barSecondsHint = 900,
): UTCTimestamp {
  const t = toUtcSeconds(iso) as number;
  if (!barTimes.length) return t as UTCTimestamp;
  // Prefer bar whose open is <= t < open+step (infer step from median delta)
  let step = barSecondsHint;
  if (barTimes.length >= 2) {
    const deltas: number[] = [];
    for (let i = 1; i < Math.min(barTimes.length, 40); i++) {
      deltas.push(barTimes[i]! - barTimes[i - 1]!);
    }
    deltas.sort((a, b) => a - b);
    step = deltas[Math.floor(deltas.length / 2)] || barSecondsHint;
  }
  let best = barTimes[0]!;
  for (const bt of barTimes) {
    if (bt <= t && t < bt + step) return bt as UTCTimestamp;
    if (Math.abs(bt - t) < Math.abs(best - t)) best = bt;
  }
  return best as UTCTimestamp;
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

export function TradeChart({ candles, trades, selectedTrade = null }: Props) {
  const { t } = useLocale();
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const overlayRef = useRef<ISeriesApi<"Line">[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: {
          type: ColorType.Solid,
          color: cssVar("--chart-bg", "#ffffff"),
        },
        textColor: cssVar("--chart-text", "#57534e"),
      },
      grid: {
        vertLines: { color: cssVar("--chart-grid", "#f0efed") },
        horzLines: { color: cssVar("--chart-grid", "#f0efed") },
      },
      rightPriceScale: { borderColor: cssVar("--chart-border", "#e7e5e4") },
      timeScale: {
        borderColor: cssVar("--chart-border", "#e7e5e4"),
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const up = cssVar("--chart-up", "#0f766e");
    const down = cssVar("--chart-down", "#b91c1c");
    const series = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      borderVisible: false,
      wickUpColor: up,
      wickDownColor: down,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const onResize = () => {
      if (!containerRef.current) return;
      chart.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      overlayRef.current = [];
    };
  }, [theme]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    for (const line of overlayRef.current) {
      try {
        chart.removeSeries(line);
      } catch {
        /* already removed */
      }
    }
    overlayRef.current = [];

    const data = candles
      .map((c) => ({
        time: toUtcSeconds(c.timestamp) as Time,
        open: num(c.open),
        high: num(c.high),
        low: num(c.low),
        close: num(c.close),
      }))
      .sort((a, b) => Number(a.time) - Number(b.time));

    series.setData(data);
    const barTimes = data.map((d) => Number(d.time));

    const up = cssVar("--chart-up", "#0f766e");
    const down = cssVar("--chart-down", "#b91c1c");
    const exit = cssVar("--muted", "#78716c");
    const obColor = cssVar("--accent", "#0d9488");
    const liqColor = "#a16207";
    const slColor = "#b91c1c";
    const tpColor = "#15803d";

    const markers: SeriesMarker<Time>[] = [];
    const focus = selectedTrade;
    for (const trade of trades) {
      const isFocus =
        focus != null &&
        trade.entry_time === focus.entry_time &&
        trade.side === focus.side;
      const faded = focus != null && !isFocus;
      markers.push({
        time: snapTime(trade.entry_time, barTimes) as Time,
        position: trade.side === "short" ? "aboveBar" : "belowBar",
        color: faded ? "#a8a29e" : trade.side === "long" ? up : down,
        shape: trade.side === "long" ? "arrowUp" : "arrowDown",
        text: trade.side === "long" ? "L entry" : "S entry",
      });
      if (trade.exit_time) {
        markers.push({
          time: snapTime(trade.exit_time, barTimes) as Time,
          position: "aboveBar",
          color: faded ? "#d6d3d1" : exit,
          shape: "circle",
          text: isFocus || focus == null ? "exit" : "",
        });
      }
    }

    const setup: TradeSetup | null | undefined = focus?.setup;
    if (setup?.ob) {
      const endIso = setup.scm?.time ?? focus!.entry_time;
      const fromIso = setup.ob.time;
      const top = num(setup.ob.top);
      const bottom = num(setup.ob.bottom);
      const obTop = chart.addSeries(LineSeries, {
        color: obColor,
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        lastValueVisible: true,
        priceLineVisible: false,
        title: "OB top",
      });
      const obBot = chart.addSeries(LineSeries, {
        color: obColor,
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        lastValueVisible: true,
        priceLineVisible: false,
        title: "OB bot",
      });
      const fromT = snapTime(fromIso, barTimes);
      const toT = snapTime(endIso, barTimes);
      obTop.setData([
        { time: fromT as Time, value: top },
        { time: toT as Time, value: top },
      ]);
      obBot.setData([
        { time: fromT as Time, value: bottom },
        { time: toT as Time, value: bottom },
      ]);
      overlayRef.current.push(obTop, obBot);

      markers.push({
        time: fromT as Time,
        position: "belowBar",
        color: obColor,
        shape: "square",
        text: "OB",
      });
      if (setup.ob.bos_time) {
        markers.push({
          time: snapTime(setup.ob.bos_time, barTimes) as Time,
          position: "aboveBar",
          color: obColor,
          shape: "square",
          text: "BOS",
        });
      }
    }

    if (setup?.liquidity) {
      const liq = num(setup.liquidity.price);
      const fromIso = setup.liquidity.time;
      const toIso = setup.scm?.time ?? focus!.entry_time;
      const liqLine = chart.addSeries(LineSeries, {
        color: liqColor,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        lastValueVisible: true,
        priceLineVisible: false,
        title: "Liq",
      });
      const fromT = snapTime(fromIso, barTimes);
      const toT = snapTime(toIso, barTimes);
      liqLine.setData([
        { time: fromT as Time, value: liq },
        { time: toT as Time, value: liq },
      ]);
      overlayRef.current.push(liqLine);
      markers.push({
        time: fromT as Time,
        position: "aboveBar",
        color: liqColor,
        shape: "circle",
        text: setup.liquidity.kind === "sell_side" ? "Sell Liq" : "Buy Liq",
      });
    }

    if (setup?.scm) {
      markers.push({
        time: snapTime(setup.scm.time, barTimes) as Time,
        position: focus?.side === "short" ? "aboveBar" : "belowBar",
        color: focus?.side === "long" ? up : down,
        shape: "circle",
        text: "SCM",
      });
    }

    if (setup?.sl != null && focus) {
      const slLine = chart.addSeries(LineSeries, {
        color: slColor,
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        lastValueVisible: true,
        priceLineVisible: false,
        title: "SL",
      });
      const end =
        focus.exit_time ??
        candles[candles.length - 1]?.timestamp ??
        focus.entry_time;
      slLine.setData([
        {
          time: snapTime(focus.entry_time, barTimes) as Time,
          value: num(setup.sl),
        },
        { time: snapTime(end, barTimes) as Time, value: num(setup.sl) },
      ]);
      overlayRef.current.push(slLine);
    }
    if (setup?.tp != null && focus) {
      const tpLine = chart.addSeries(LineSeries, {
        color: tpColor,
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        lastValueVisible: true,
        priceLineVisible: false,
        title: "TP",
      });
      const end =
        focus.exit_time ??
        candles[candles.length - 1]?.timestamp ??
        focus.entry_time;
      tpLine.setData([
        {
          time: snapTime(focus.entry_time, barTimes) as Time,
          value: num(setup.tp),
        },
        { time: snapTime(end, barTimes) as Time, value: num(setup.tp) },
      ]);
      overlayRef.current.push(tpLine);
    }

    markers.sort((a, b) => Number(a.time) - Number(b.time));
    createSeriesMarkers(series, markers);

    if (data.length) {
      if (setup?.ob && focus) {
        const from = snapTime(setup.ob.time, barTimes) as number;
        const to = snapTime(
          focus.exit_time ?? focus.entry_time,
          barTimes,
        ) as number;
        const pad = Math.max(3600, Math.floor(Math.abs(to - from) * 0.25) || 3600);
        chart.timeScale().setVisibleRange({
          from: (from - pad) as Time,
          to: (to + pad) as Time,
        });
      } else {
        chart.timeScale().fitContent();
      }
    }
  }, [candles, trades, selectedTrade, theme]);

  const hasSetup = Boolean(selectedTrade?.setup);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
        <span>{t("analyzer.chartTitle")}</span>
        {hasSetup ? (
          <span className="text-[11px] text-[var(--fg)]">
            {t("analyzer.setupOverlayHint")}
          </span>
        ) : trades.length ? (
          <span className="text-[11px]">{t("analyzer.setupSelectHint")}</span>
        ) : null}
      </div>
      <div ref={containerRef} className="h-[420px] w-full" />
      {!candles.length ? (
        <p className="px-4 py-3 text-sm text-[var(--muted)]">
          {t("analyzer.noCandles")}
        </p>
      ) : null}
    </div>
  );
}
