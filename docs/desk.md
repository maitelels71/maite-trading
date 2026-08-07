# Trading desk layout

## Tabs

| Tab | Purpose |
|-----|---------|
| **Daily** | Professional pre-open / session / post checklist + bias + notes (local) |
| **Mind** | Psychotrading: ritual A–E, life/trading mantras, quotes |
| **Strategies** | Playbooks (rules by timeframe, entry/exit) + live scan for that strategy |
| **Analyzer** | Deep-dive one symbol: evaluate / backtest / chart |
| **News** | Red folder calendar + session headlines |
| **Admin** | Schwab token expiry, Refresh, Publish to Secrets Manager (staging) |

Theme: **Light / Dark** toggle in the top nav (persisted in `localStorage` as `maite.theme`). Dark follows a trading-desk palette (near-black surfaces, bright candles).

Scanner as a separate tab was removed: strategy-first scanning lives under **Strategies**.

## Daily review

Checklist inspired by discretionary process: calendar, bias, levels, risk limits, no revenge, journal. Persisted in `localStorage` per NY date (`maite.daily-review.YYYY-MM-DD`).

## Strategies

Playbooks in `frontend/src/lib/playbooks.ts`. Each book has entry steps, exits, risk, invalidation, and timeframe checklists. **Scan now** calls `POST /strategy/scan` filtered to that strategy’s registry key. Draft books (no `strategyKey`) show rules only until an engine exists.

### Structure Bias Continuation (SBC)

Discretionary playbook from your live NQ process: **1H ChoCh/BOS bias → 15m OB/Breaker/FVG zone → 1m/3m confirm**. Not auto-scanned yet (needs structure detection); use as checklist while trading.