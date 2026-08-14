"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";

import { useTheme } from "@/components/ThemeProvider";
import { useLocale } from "@/components/LocaleProvider";
import type { Candle, Trade } from "@/lib/types";

type Props = {
  candles: Candle[];
  trades: Trade[];
};

function toUtcSeconds(iso: string): UTCTimestamp {
  return Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;
}

function num(v: string | number): number {
  return typeof v === "number" ? v : Number(v);
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

export function TradeChart({ candles, trades }: Props) {
  const { t } = useLocale();
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

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
    };
  }, [theme]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

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

    const up = cssVar("--chart-up", "#0f766e");
    const down = cssVar("--chart-down", "#b91c1c");
    const exit = cssVar("--muted", "#78716c");

    const markers: SeriesMarker<Time>[] = [];
    for (const trade of trades) {
      markers.push({
        time: toUtcSeconds(trade.entry_time) as Time,
        position: trade.side === "short" ? "aboveBar" : "belowBar",
        color: trade.side === "long" ? up : down,
        shape: trade.side === "long" ? "arrowUp" : "arrowDown",
        text: trade.side === "long" ? "L entry" : "S entry",
      });
      if (trade.exit_time) {
        markers.push({
          time: toUtcSeconds(trade.exit_time) as Time,
          position: "aboveBar",
          color: exit,
          shape: "circle",
          text: "exit",
        });
      }
    }
    markers.sort((a, b) => Number(a.time) - Number(b.time));
    createSeriesMarkers(series, markers);

    if (data.length) {
      chart.timeScale().fitContent();
    }
  }, [candles, trades, theme]);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
        {t("analyzer.chartTitle")}
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
