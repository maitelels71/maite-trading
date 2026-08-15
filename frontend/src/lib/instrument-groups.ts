/** Group equity/options watchlists for selects: Indices → Stocks → Watch. */

import type { Instrument } from "@/lib/types";
import { sortFuturesInstruments } from "@/lib/types";

/** Index / ETF sleeve shown first in Options desk lists. */
export const INDEX_ETF_SYMBOLS = new Set(["SPY", "QQQ", "IWM"]);

/** Newer speculative names kept as their own group (last). */
export const WATCH_SYMBOLS = new Set(["USAR", "UUUU", "ONDS"]);

export const WATCH_ORDER = ["USAR", "UUUU", "ONDS"] as const;

export type InstrumentSelectGroup = {
  id: "indices" | "stocks" | "watch" | "futures" | "other";
  /** i18n key under instruments.* */
  labelKey: string;
  items: Instrument[];
};

export type SymbolSelectGroup = {
  id: InstrumentSelectGroup["id"];
  labelKey: string;
  symbols: string[];
};

function bySymbol(a: Instrument, b: Instrument): number {
  return a.symbol.localeCompare(b.symbol);
}

function sortWatch(items: Instrument[]): Instrument[] {
  const rank = new Map<string, number>(WATCH_ORDER.map((s, i) => [s, i]));
  return [...items].sort((a, b) => {
    const ra = rank.get(a.symbol.toUpperCase()) ?? 99;
    const rb = rank.get(b.symbol.toUpperCase()) ?? 99;
    if (ra !== rb) return ra - rb;
    return bySymbol(a, b);
  });
}

/** Schwab/options desk: Indices/ETFs · Stocks · Watch (USAR/UUUU/ONDS). */
export function groupEquityInstruments(
  items: Instrument[],
): InstrumentSelectGroup[] {
  const indices: Instrument[] = [];
  const stocks: Instrument[] = [];
  const watch: Instrument[] = [];
  const other: Instrument[] = [];

  for (const row of items) {
    const sym = row.symbol.toUpperCase();
    if (WATCH_SYMBOLS.has(sym)) {
      watch.push(row);
      continue;
    }
    if (INDEX_ETF_SYMBOLS.has(sym) || row.market_type === "etf") {
      indices.push(row);
      continue;
    }
    if (row.market_type === "stock") {
      stocks.push(row);
      continue;
    }
    other.push(row);
  }

  const groups: InstrumentSelectGroup[] = [];
  if (indices.length) {
    groups.push({
      id: "indices",
      labelKey: "instruments.groupIndices",
      items: indices.sort(bySymbol),
    });
  }
  if (stocks.length) {
    groups.push({
      id: "stocks",
      labelKey: "instruments.groupStocks",
      items: stocks.sort(bySymbol),
    });
  }
  if (watch.length) {
    groups.push({
      id: "watch",
      labelKey: "instruments.groupWatch",
      items: sortWatch(watch),
    });
  }
  if (other.length) {
    groups.push({
      id: "other",
      labelKey: "instruments.groupOther",
      items: other.sort(bySymbol),
    });
  }
  return groups;
}

export function groupInstrumentsForVenue(
  items: Instrument[],
  venue: "schwab" | "tradeadvocate",
): InstrumentSelectGroup[] {
  if (venue === "tradeadvocate") {
    const futures = sortFuturesInstruments(
      items.filter((i) => i.market_type === "future" || i.data_provider === "tradeadvocate"),
    );
    if (!futures.length) return [];
    return [
      {
        id: "futures",
        labelKey: "instruments.groupFutures",
        items: futures,
      },
    ];
  }
  return groupEquityInstruments(
    items.filter((i) => i.data_provider === "schwab" || i.market_type !== "future"),
  );
}

/** Same grouping for plain symbol strings (checklist fallbacks). */
export function groupEquitySymbols(symbols: string[]): SymbolSelectGroup[] {
  const uniq = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))];
  const indices: string[] = [];
  const stocks: string[] = [];
  const watch: string[] = [];

  for (const sym of uniq) {
    if (WATCH_SYMBOLS.has(sym)) watch.push(sym);
    else if (INDEX_ETF_SYMBOLS.has(sym)) indices.push(sym);
    else stocks.push(sym);
  }

  const watchSorted = [...watch].sort((a, b) => {
    const ra = (WATCH_ORDER as readonly string[]).indexOf(a);
    const rb = (WATCH_ORDER as readonly string[]).indexOf(b);
    const ia = ra === -1 ? 99 : ra;
    const ib = rb === -1 ? 99 : rb;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b);
  });

  const groups: SymbolSelectGroup[] = [];
  if (indices.length) {
    groups.push({
      id: "indices",
      labelKey: "instruments.groupIndices",
      symbols: indices.sort(),
    });
  }
  if (stocks.length) {
    groups.push({
      id: "stocks",
      labelKey: "instruments.groupStocks",
      symbols: stocks.sort(),
    });
  }
  if (watchSorted.length) {
    groups.push({
      id: "watch",
      labelKey: "instruments.groupWatch",
      symbols: watchSorted,
    });
  }
  return groups;
}
