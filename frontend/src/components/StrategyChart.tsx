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
} from "lightweight-charts";
import type { Candle, Trade } from "@/lib/api";
import { num } from "@/lib/api";

type Props = {
  candles: Candle[];
  trades: Trade[];
};

function toUnix(iso: string): Time {
  return Math.floor(new Date(iso).getTime() / 1000) as Time;
}

export function StrategyChart({ candles, trades }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || !candles.length) return;

    const chart: IChartApi = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8aa399",
        fontFamily: "DM Sans, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(140,180,160,0.08)" },
        horzLines: { color: "rgba(140,180,160,0.08)" },
      },
      rightPriceScale: { borderColor: "rgba(140,180,160,0.2)" },
      timeScale: { borderColor: "rgba(140,180,160,0.2)", timeVisible: true },
      width: containerRef.current.clientWidth,
      height: 420,
    });

    const series: ISeriesApi<"Candlestick"> = chart.addSeries(CandlestickSeries, {
      upColor: "#3dd68c",
      downColor: "#ff7a6e",
      borderUpColor: "#3dd68c",
      borderDownColor: "#ff7a6e",
      wickUpColor: "#3dd68c",
      wickDownColor: "#ff7a6e",
    });

    const sorted = [...candles].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    series.setData(
      sorted.map((c) => ({
        time: toUnix(c.timestamp),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    const markers: SeriesMarker<Time>[] = [];
    for (const t of trades) {
      markers.push({
        time: toUnix(t.entry_time),
        position: t.side === "short" ? "aboveBar" : "belowBar",
        color: t.side === "short" ? "#ff7a6e" : "#3dd68c",
        shape: t.side === "short" ? "arrowDown" : "arrowUp",
        text: t.side === "short" ? "SHORT" : "LONG",
      });
      if (t.exit_time) {
        markers.push({
          time: toUnix(t.exit_time),
          position: "aboveBar",
          color: "#e6c35c",
          shape: "circle",
          text: "EXIT",
        });
      }
      series.createPriceLine({
        price: num(t.entry_price),
        color: t.side === "short" ? "rgba(255,122,110,0.55)" : "rgba(61,214,140,0.55)",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: t.side.toUpperCase(),
      });
    }
    createSeriesMarkers(series, markers);
    chart.timeScale().fitContent();

    const onResize = () => {
      if (!containerRef.current) return;
      chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
    };
  }, [candles, trades]);

  if (!candles.length) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--bg-panel)] text-[var(--muted)]">
        Run evaluate or backtest to render candles and entries.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-panel)] backdrop-blur-md"
      style={{ boxShadow: "var(--shadow)" }}
    />
  );
}
