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

export function TradeChart({ candles, trades }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#57534e",
      },
      grid: {
        vertLines: { color: "#f0efed" },
        horzLines: { color: "#f0efed" },
      },
      rightPriceScale: { borderColor: "#e7e5e4" },
      timeScale: { borderColor: "#e7e5e4", timeVisible: true, secondsVisible: false },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#0f766e",
      downColor: "#b91c1c",
      borderVisible: false,
      wickUpColor: "#0f766e",
      wickDownColor: "#b91c1c",
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
  }, []);

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

    const markers: SeriesMarker<Time>[] = [];
    for (const trade of trades) {
      markers.push({
        time: toUtcSeconds(trade.entry_time) as Time,
        position: trade.side === "short" ? "aboveBar" : "belowBar",
        color: trade.side === "long" ? "#0f766e" : "#b91c1c",
        shape: trade.side === "long" ? "arrowUp" : "arrowDown",
        text: trade.side === "long" ? "L entry" : "S entry",
      });
      if (trade.exit_time) {
        markers.push({
          time: toUtcSeconds(trade.exit_time) as Time,
          position: "aboveBar",
          color: "#78716c",
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
  }, [candles, trades]);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
        Candlestick · entries / exits
      </div>
      <div ref={containerRef} className="h-[420px] w-full" />
      {!candles.length ? (
        <p className="px-4 py-3 text-sm text-[var(--muted)]">
          No candles loaded yet. Sync data or run evaluate/backtest after candles
          exist in the database.
        </p>
      ) : null}
    </div>
  );
}
