"""Generate frontend/src/lib/options-premium-ranges.ts from Investep XLS."""

from __future__ import annotations

import json
import re
from pathlib import Path

import xlrd

DOCS = Path(r"C:\INVESTEP_YANDYS\x-Conferencia - curso Yudith - paso a paso\1- DOCUMENTS")
OUT = Path(__file__).resolve().parents[1] / "frontend" / "src" / "lib" / "options-premium-ranges.ts"


def parse_range(s: str) -> tuple[float | None, float | None]:
    s = str(s).replace("–", "-").replace("—", "-")
    nums = re.findall(r"[\d.]+", s)
    if len(nums) >= 2:
        return float(nums[0]), float(nums[1])
    return None, None


def main() -> None:
    xls = next(DOCS.glob("rango*.xls"))
    sh = xlrd.open_workbook(str(xls)).sheet_by_index(0)
    rows: list[dict] = []
    for r in range(1, sh.nrows):
        ticker = str(sh.cell_value(r, 0)).strip().upper()
        opt = str(sh.cell_value(r, 1)).strip()
        mm = str(sh.cell_value(r, 2)).strip()
        block = str(sh.cell_value(r, 4)).strip()
        sector = str(sh.cell_value(r, 5)).strip()
        name = str(sh.cell_value(r, 7)).strip()
        if " - " in name:
            name = name.split(" - ")[0]
        olo, ohi = parse_range(opt)
        mlo, mhi = parse_range(mm)
        if olo is None or ohi is None or mlo is None or mhi is None:
            raise SystemExit(f"bad row {r}: {ticker} {opt!r} {mm!r}")
        rows.append(
            {
                "ticker": ticker,
                "name": name,
                "block": block,
                "sector": sector,
                "optimalLow": olo,
                "optimalHigh": ohi,
                "minPrem": mlo,
                "maxPrem": mhi,
                "optimalLabel": opt,
                "minmaxLabel": mm,
            }
        )

    parts: list[str] = [
        "/** Investep Academy option premium ranges (rango_precios_opciones_2026-06-16.xls). */",
        "",
        "export type OptionPremiumRange = {",
        "  ticker: string;",
        "  name: string;",
        "  block: string;",
        "  sector: string;",
        "  /** Optimal premium band ($). */",
        "  optimalLow: number;",
        "  optimalHigh: number;",
        "  minPrem: number;",
        "  maxPrem: number;",
        "  optimalLabel: string;",
        "  minmaxLabel: string;",
        "};",
        "",
        "export const OPTION_PREMIUM_RANGES: OptionPremiumRange[] = [",
    ]
    for row in rows:
        parts.append("  {")
        for key in (
            "ticker",
            "name",
            "block",
            "sector",
            "optimalLow",
            "optimalHigh",
            "minPrem",
            "maxPrem",
            "optimalLabel",
            "minmaxLabel",
        ):
            val = row[key]
            parts.append(f"    {key}: {json.dumps(val)},")
        parts.append("  },")
    parts.append("];")
    parts.append("")
    parts.append(
        """const ALIASES: Record<string, string> = {
  GOOGL: "GOOG",
  GOOG: "GOOG",
};

export function premiumRangeFor(symbol: string): OptionPremiumRange | null {
  const key = ALIASES[symbol.toUpperCase()] ?? symbol.toUpperCase();
  return OPTION_PREMIUM_RANGES.find((r) => r.ticker === key) ?? null;
}

/** ATM-style strike rounding for equities / ETFs (planning helper — confirm on chain). */
export function nearestStrike(spot: number): number {
  if (!Number.isFinite(spot) || spot <= 0) return 0;
  if (spot >= 200) return Math.round(spot / 5) * 5;
  if (spot >= 25) return Math.round(spot);
  return Math.round(spot * 2) / 2;
}

export type OptionsEntryPlan = {
  symbol: string;
  optionType: "CALL" | "PUT";
  spot: number;
  strike: number;
  premiumLow: number;
  premiumHigh: number;
  /** Mid of academy optimal band — use as planned debit until live quote. */
  entryPremium: number;
  tp10: number;
  tp20: number;
  tp35: number;
  rangeLabel: string;
  minmaxLabel: string;
  hasRange: boolean;
};

export function buildOptionsEntryPlan(
  symbol: string,
  side: "long" | "short" | string | null | undefined,
  spotRaw: number | string | null | undefined,
): OptionsEntryPlan | null {
  const spot =
    typeof spotRaw === "number"
      ? spotRaw
      : spotRaw != null && String(spotRaw).trim() !== ""
        ? Number(spotRaw)
        : NaN;
  if (!Number.isFinite(spot) || spot <= 0) return null;

  const optionType: "CALL" | "PUT" =
    side === "short" || String(side).toLowerCase() === "put" ? "PUT" : "CALL";
  const strike = nearestStrike(spot);
  const band = premiumRangeFor(symbol);
  const premiumLow = band?.optimalLow ?? 0;
  const premiumHigh = band?.optimalHigh ?? 0;
  const entryPremium = band
    ? Math.round(((band.optimalLow + band.optimalHigh) / 2) * 100) / 100
    : 0;

  const tp = (pct: number) =>
    entryPremium > 0
      ? Math.round(entryPremium * (1 + pct) * 100) / 100
      : 0;

  return {
    symbol: symbol.toUpperCase(),
    optionType,
    spot: Math.round(spot * 100) / 100,
    strike,
    premiumLow,
    premiumHigh,
    entryPremium,
    tp10: tp(0.1),
    tp20: tp(0.2),
    tp35: tp(0.35),
    rangeLabel: band?.optimalLabel ?? "—",
    minmaxLabel: band?.minmaxLabel ?? "—",
    hasRange: Boolean(band),
  };
}

export function rangesByBlock(): Map<string, OptionPremiumRange[]> {
  const map = new Map<string, OptionPremiumRange[]>();
  for (const row of OPTION_PREMIUM_RANGES) {
    const list = map.get(row.block) ?? [];
    list.push(row);
    map.set(row.block, list);
  }
  return map;
}

export function stickyCardsFromRanges() {
  return [...rangesByBlock().entries()].map(([block, rows]) => ({
    id: `rango-${block.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title: block,
    summary: "Rango óptimo de prima · jun 2026",
    bullets: rows.map(
      (r) => `${r.ticker} · óptimo ${r.optimalLabel} · ${r.minmaxLabel}`,
    ),
  }));
}
"""
    )
    OUT.write_text("\n".join(parts), encoding="utf-8")
    print(f"wrote {OUT} ({len(rows)} tickers)")


if __name__ == "__main__":
    main()
