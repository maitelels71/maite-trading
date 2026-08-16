"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  LineStyle,
  type IChartApi,
  type IPriceLine,
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
  selectedTrade?: Trade | null;
};

type ZonePaint = {
  from: number;
  to: number;
  top: number;
  bottom: number;
  liq?: number;
};

function toUtcSeconds(iso: string): UTCTimestamp {
  return Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;
}

function num(v: string | number): number {
  return typeof v === "number" ? v : Number(v);
}

function barStep(barTimes: number[], hint = 900): number {
  if (barTimes.length < 2) return hint;
  const deltas: number[] = [];
  for (let i = 1; i < Math.min(barTimes.length, 40); i++) {
    deltas.push(barTimes[i]! - barTimes[i - 1]!);
  }
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)] || hint;
}

/** Snap an ISO time onto the candle bar that contains it. */
function snapTime(iso: string, barTimes: number[]): UTCTimestamp {
  const t = toUtcSeconds(iso) as number;
  if (!barTimes.length) return t as UTCTimestamp;
  const step = barStep(barTimes);
  let best = barTimes[0]!;
  for (const bt of barTimes) {
    if (bt <= t && t < bt + step) return bt as UTCTimestamp;
    if (Math.abs(bt - t) < Math.abs(best - t)) best = bt;
  }
  return best as UTCTimestamp;
}

function barIndex(barTimes: number[], t: number): number {
  let best = 0;
  for (let i = 0; i < barTimes.length; i++) {
    if (Math.abs(barTimes[i]! - t) < Math.abs(barTimes[best]! - t)) best = i;
  }
  return best;
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const zoneRef = useRef<ZonePaint | null>(null);

  function clearPriceLines() {
    const series = seriesRef.current;
    if (!series) return;
    for (const line of priceLinesRef.current) {
      try {
        series.removePriceLine(line);
      } catch {
        /* gone */
      }
    }
    priceLinesRef.current = [];
  }

  function paintZone() {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    const zone = zoneRef.current;
    if (!canvas || !chart || !series) return;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w <= 0 || h <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!zone) return;

    const x1 = chart.timeScale().timeToCoordinate(zone.from as Time);
    const x2 = chart.timeScale().timeToCoordinate(zone.to as Time);
    const yTop = series.priceToCoordinate(zone.top);
    const yBot = series.priceToCoordinate(zone.bottom);
    if (x1 == null || x2 == null || yTop == null || yBot == null) return;

    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    const top = Math.min(yTop, yBot);
    const bottom = Math.max(yTop, yBot);
    const width = Math.max(right - left, 6);

    // HTF OB zone fill
    ctx.fillStyle = "rgba(13, 148, 136, 0.22)";
    ctx.strokeStyle = "rgba(13, 148, 136, 0.85)";
    ctx.lineWidth = 1.5;
    ctx.fillRect(left, top, width, Math.max(bottom - top, 3));
    ctx.strokeRect(left, top, width, Math.max(bottom - top, 3));

    ctx.fillStyle = "rgba(13, 148, 136, 0.95)";
    ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("OB HTF", left + 4, Math.max(12, top - 4));

    if (zone.liq != null) {
      const yLiq = series.priceToCoordinate(zone.liq);
      if (yLiq != null) {
        ctx.strokeStyle = "rgba(161, 98, 7, 0.9)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(left, yLiq);
        ctx.lineTo(left + width, yLiq);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(161, 98, 7, 0.95)";
        ctx.fillText("Liq", left + 4, yLiq - 4);
      }
    }
  }

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
      paintZone();
    };
    window.addEventListener("resize", onResize);
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => paintZone());

    return () => {
      window.removeEventListener("resize", onResize);
      clearPriceLines();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      zoneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chart bootstrap once per theme
  }, [theme]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    clearPriceLines();
    zoneRef.current = null;

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
    const step = barStep(barTimes);

    const up = cssVar("--chart-up", "#0f766e");
    const down = cssVar("--chart-down", "#b91c1c");
    const exit = cssVar("--muted", "#78716c");
    const obColor = "#0d9488";
    const liqColor = "#a16207";
    const slColor = "#b91c1c";
    const tpColor = "#15803d";

    const focus = selectedTrade;
    const markers: SeriesMarker<Time>[] = [];

    // When a setup is selected: only that trade's entry/exit (avoid label pile-ups).
    const visibleTrades =
      focus != null
        ? trades.filter(
            (tr) =>
              tr.entry_time === focus.entry_time && tr.side === focus.side,
          )
        : trades;

    for (const trade of visibleTrades) {
      markers.push({
        time: snapTime(trade.entry_time, barTimes) as Time,
        position: trade.side === "short" ? "aboveBar" : "belowBar",
        color: trade.side === "long" ? up : down,
        shape: trade.side === "long" ? "arrowUp" : "arrowDown",
        text: trade.side === "long" ? "L entry" : "S entry",
      });
      if (trade.exit_time) {
        markers.push({
          time: snapTime(trade.exit_time, barTimes) as Time,
          position: "belowBar",
          color: exit,
          shape: "circle",
          text: "exit",
        });
      }
    }

    const setup: TradeSetup | null | undefined = focus?.setup;
    if (setup?.ob && focus) {
      const entryT = snapTime(focus.entry_time, barTimes) as number;
      const obT = snapTime(setup.ob.time, barTimes) as number;
      const bosT = setup.ob.bos_time
        ? (snapTime(setup.ob.bos_time, barTimes) as number)
        : null;
      const zoneFrom = Math.min(obT, bosT ?? obT, entryT);
      const zoneTo = Math.max(obT, entryT);
      const top = num(setup.ob.top);
      const bottom = num(setup.ob.bottom);
      const liq =
        setup.liquidity != null ? num(setup.liquidity.price) : undefined;

      zoneRef.current = {
        from: zoneFrom,
        to: Math.max(zoneTo, zoneFrom + step),
        top,
        bottom,
        liq,
      };

      // Axis labels only (no extra series titles cluttering the pane)
      priceLinesRef.current.push(
        series.createPriceLine({
          price: top,
          color: obColor,
          lineWidth: 1,
          lineStyle: LineStyle.SparseDotted,
          axisLabelVisible: true,
          title: "OB↑",
        }),
        series.createPriceLine({
          price: bottom,
          color: obColor,
          lineWidth: 1,
          lineStyle: LineStyle.SparseDotted,
          axisLabelVisible: true,
          title: "OB↓",
        }),
      );

      if (liq != null) {
        priceLinesRef.current.push(
          series.createPriceLine({
            price: liq,
            color: liqColor,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: "Liq",
          }),
        );
      }

      // BOS marker only if clearly before the entry bar
      if (bosT != null && Math.abs(bosT - entryT) >= step) {
        markers.push({
          time: bosT as Time,
          position: "aboveBar",
          color: obColor,
          shape: "square",
          text: "BOS",
        });
      }

      if (setup.sl != null) {
        priceLinesRef.current.push(
          series.createPriceLine({
            price: num(setup.sl),
            color: slColor,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: "SL",
          }),
        );
      }
      if (setup.tp != null) {
        priceLinesRef.current.push(
          series.createPriceLine({
            price: num(setup.tp),
            color: tpColor,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: "TP",
          }),
        );
      }
    }

    markers.sort((a, b) => Number(a.time) - Number(b.time));
    createSeriesMarkers(series, markers);

    if (data.length) {
      if (setup?.ob && focus) {
        const obT = snapTime(setup.ob.time, barTimes) as number;
        const bosT = setup.ob.bos_time
          ? (snapTime(setup.ob.bos_time, barTimes) as number)
          : obT;
        const entryT = snapTime(focus.entry_time, barTimes) as number;
        const exitT = focus.exit_time
          ? (snapTime(focus.exit_time, barTimes) as number)
          : entryT;
        const leftT = Math.min(obT, bosT, entryT);
        const rightT = Math.max(entryT, exitT);
        const leftIdx = Math.max(0, barIndex(barTimes, leftT) - 24);
        const rightIdx = Math.min(
          barTimes.length - 1,
          barIndex(barTimes, rightT) + 8,
        );
        chart.timeScale().setVisibleRange({
          from: barTimes[leftIdx]! as Time,
          to: barTimes[rightIdx]! as Time,
        });
      } else {
        chart.timeScale().fitContent();
      }
    }

    // Paint after layout settles
    requestAnimationFrame(() => paintZone());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, trades, selectedTrade, theme]);

  const hasSetup = Boolean(selectedTrade?.setup);
  const setup = selectedTrade?.setup;

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
      <div className="relative h-[460px] w-full">
        <div ref={containerRef} className="absolute inset-0" />
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
        />
      </div>
      {hasSetup && setup?.ob ? (
        <div className="grid gap-1 border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--muted)] sm:grid-cols-3">
          <div>
            <span className="font-medium text-[var(--fg)]">OB HTF</span>
            {" · "}
            {num(setup.ob.bottom).toFixed(2)} – {num(setup.ob.top).toFixed(2)}
          </div>
          {setup.liquidity ? (
            <div>
              <span className="font-medium text-[var(--fg)]">
                {setup.liquidity.kind === "sell_side" ? "Sell Liq" : "Buy Liq"}
              </span>
              {" · "}
              {num(setup.liquidity.price).toFixed(2)}
            </div>
          ) : null}
          {setup.sl != null || setup.tp != null ? (
            <div>
              <span className="font-medium text-[var(--fg)]">SL / TP</span>
              {" · "}
              {setup.sl != null ? num(setup.sl).toFixed(2) : "—"} /{" "}
              {setup.tp != null ? num(setup.tp).toFixed(2) : "—"}
            </div>
          ) : null}
        </div>
      ) : null}
      {!candles.length ? (
        <p className="px-4 py-3 text-sm text-[var(--muted)]">
          {t("analyzer.noCandles")}
        </p>
      ) : null}
    </div>
  );
}
