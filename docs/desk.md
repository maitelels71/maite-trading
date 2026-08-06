# Trading desk layout

## Tabs

| Tab | Purpose |
|-----|---------|
| **Daily** | Professional pre-open / session / post checklist + bias + notes (local) |
| **Strategies** | Playbooks (rules by timeframe, entry/exit) + live scan for that strategy |
| **Analyzer** | Deep-dive one symbol: evaluate / backtest / chart |
| **News** | Red folder calendar + session headlines |

Scanner as a separate tab was removed: strategy-first scanning lives under **Strategies**.

## Daily review

Checklist inspired by discretionary process: calendar, bias, levels, risk limits, no revenge, journal. Persisted in `localStorage` per NY date (`maite.daily-review.YYYY-MM-DD`).

## Strategies

Playbooks in `frontend/src/lib/playbooks.ts`. Each book has entry steps, exits, risk, invalidation, and timeframe checklists. **Scan now** calls `POST /strategy/scan` filtered to that strategy’s registry key. Draft books (no `strategyKey`) show rules only until an engine exists.
