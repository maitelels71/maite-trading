# Premarket desk

OceanView-inspired pre-open workspace for maite-trading.

## Goal

Run all active strategies across the instrument universe for a NY session day, group results by strategy, persist a `runId`, and reload the latest result later.

## UI

Nav tab: **Premarket**

| Control | Action |
|---------|--------|
| Start evaluate | `POST /premarket/evaluate/start` |
| Load last result | `GET /premarket/evaluate/result` |

## API

| Method | Path | Notes |
|--------|------|-------|
| POST | `/premarket/evaluate/start` | Runs shared scan engine; persists run |
| GET | `/premarket/evaluate/result` | Latest run, or `?run_id=` |

Response highlights: `run_id`, `summary`, `strategy_groups[]`, `best_results[]` (matched only).

## Persistence

- Local / SQL tests: in-memory store
- Staging DynamoDB: `*-backtest-runs` keys `premarket#{run_id}` + pointer `premarket#latest`

## Relation to Scanner

Scanner = live polling board. Premarket = intentional batch evaluate + saved envelope (closer to OceanView Premarket / Market Assess).
