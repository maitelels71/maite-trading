/** Desk sizing: 10% equity risk vs mid-optimal premium (×100 multiplier). */

export const DESK_RISK_PCT = 0.10;

export type OptionSizing = {
  entryPremium: number;
  costPerContract: number;
  equity: number;
  cashAvailable: number;
  riskPct: number;
  riskBudget: number;
  contracts: number;
  canOpen: boolean;
};

export function sizeLongOption(params: {
  entryPremium: number;
  equity: number;
  cashAvailable: number;
  riskPct?: number;
}): OptionSizing {
  const prem = Number(params.entryPremium) || 0;
  const equity = Number(params.equity) || 0;
  const cash = Number(params.cashAvailable) || 0;
  const riskPct = params.riskPct ?? DESK_RISK_PCT;
  const costPerContract = prem > 0 ? Math.round(prem * 100 * 100) / 100 : 0;
  const riskBudget =
    equity > 0 ? Math.round(equity * riskPct * 100) / 100 : 0;
  const byRisk = costPerContract > 0 ? Math.floor(riskBudget / costPerContract) : 0;
  const byCash = costPerContract > 0 ? Math.floor(cash / costPerContract) : 0;
  const contracts = Math.max(0, Math.min(byRisk, byCash));
  return {
    entryPremium: prem,
    costPerContract,
    equity,
    cashAvailable: cash,
    riskPct,
    riskBudget,
    contracts,
    canOpen: contracts >= 1 && costPerContract > 0,
  };
}
