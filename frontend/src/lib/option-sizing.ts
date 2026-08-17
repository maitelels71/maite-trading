/** Desk sizing: 10% consider flag · open allowed up to 50% equity. */

import { premiumRangeFor } from "@/lib/options-premium-ranges";

export const DESK_RISK_PCT = 0.10;
export const MAX_OPEN_RISK_PCT = 0.50;
/** Default OTM debit when the ticker has no academy band (watch names). */
export const DEFAULT_OTM_PREMIUM = 0.5;

export type OptionSizing = {
  entryPremium: number;
  costPerContract: number;
  equity: number;
  cashAvailable: number;
  riskPct: number;
  riskBudget: number;
  contracts: number;
  /** Cash + 1ct within max open cap (50%). */
  canOpen: boolean;
  /** Cash covers 1 contract. */
  canPayCash: boolean;
  /** 1ct ≤ 10% equity — flag as consider / less risk. */
  consider: boolean;
  /** 1 contract as % of equity (e.g. 18.5). */
  actualRiskPct: number;
  /** Equity needed so 1 contract = 10% consider. */
  equityForDeskRule: number;
  /** Equity needed so 1 contract = 50% max open. */
  equityForMaxOpen: number;
  cashShortfall: number;
};

export function plannedEntryPremium(symbol: string): number {
  const band = premiumRangeFor(symbol);
  if (!band) return DEFAULT_OTM_PREMIUM;
  return Math.round(((band.optimalLow + band.optimalHigh) / 2) * 100) / 100;
}

export function sizeLongOption(params: {
  entryPremium: number;
  equity: number;
  cashAvailable: number;
  riskPct?: number;
  maxOpenRiskPct?: number;
}): OptionSizing {
  const prem = Number(params.entryPremium) || 0;
  const equity = Number(params.equity) || 0;
  const cash = Number(params.cashAvailable) || 0;
  const riskPct = params.riskPct ?? DESK_RISK_PCT;
  const maxOpenRiskPct = params.maxOpenRiskPct ?? MAX_OPEN_RISK_PCT;
  const costPerContract = prem > 0 ? Math.round(prem * 100 * 100) / 100 : 0;
  const riskBudget =
    equity > 0 ? Math.round(equity * riskPct * 100) / 100 : 0;
  const maxBudget =
    equity > 0 ? Math.round(equity * maxOpenRiskPct * 100) / 100 : 0;
  const byRisk = costPerContract > 0 ? Math.floor(riskBudget / costPerContract) : 0;
  const byCash = costPerContract > 0 ? Math.floor(cash / costPerContract) : 0;
  const canPayCash = costPerContract > 0 && cash >= costPerContract;
  const actualRiskPct =
    equity > 0 && costPerContract > 0
      ? Math.round((costPerContract / equity) * 1000) / 10
      : 0;
  const consider =
    canPayCash && equity > 0 && costPerContract <= equity * riskPct + 1e-9;
  const withinMax =
    canPayCash && equity > 0 && costPerContract <= equity * maxOpenRiskPct + 1e-9;
  const contracts = consider
    ? Math.max(0, Math.min(byRisk, byCash))
    : withinMax
      ? 1
      : 0;
  const equityForDeskRule =
    costPerContract > 0 && riskPct > 0
      ? Math.round((costPerContract / riskPct) * 100) / 100
      : 0;
  const equityForMaxOpen =
    costPerContract > 0 && maxOpenRiskPct > 0
      ? Math.round((costPerContract / maxOpenRiskPct) * 100) / 100
      : 0;
  const cashShortfall = Math.max(
    0,
    Math.round((costPerContract - cash) * 100) / 100,
  );
  return {
    entryPremium: prem,
    costPerContract,
    equity,
    cashAvailable: cash,
    riskPct,
    riskBudget,
    contracts,
    canOpen: contracts >= 1 && costPerContract > 0,
    canPayCash,
    consider,
    actualRiskPct,
    equityForDeskRule,
    equityForMaxOpen,
    cashShortfall,
  };
}

export function sizeForSymbol(
  symbol: string,
  equity: number,
  cashAvailable: number,
  entryPremium?: number,
): OptionSizing {
  const prem =
    entryPremium != null && entryPremium > 0
      ? entryPremium
      : plannedEntryPremium(symbol);
  return sizeLongOption({
    entryPremium: prem,
    equity,
    cashAvailable,
  });
}
