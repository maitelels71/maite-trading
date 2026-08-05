# Premarket desk

Pre-open workspace for maite-trading.

## Goal

Run all active strategies across the instrument universe for a NY session day, group results by strategy, persist a `runId`, and reload the latest result later. Watch selected symbol+strategy pairs until they match.

## UI

Nav tab: **Premarket**

| Control | Action |
|---------|--------|
| Start evaluate | `POST /premarket/evaluate/start` |
| Load last result | `GET /premarket/evaluate/result` |
| Add alarm watch | Polls `POST /premarket/alarm/check` until `met` |

## API

| Method | Path | Notes |
|--------|------|-------|
| POST | `/premarket/evaluate/start` | Runs shared scan engine; persists run |
| GET | `/premarket/evaluate/result` | Latest run, or `?run_id=` |
| POST | `/premarket/alarm/check` | One symbol + strategy; `met` when scan matched |

Alarm request: `symbol`, `strategy`, optional `timeframe`, `session_date`, `data_provider`.  
Alarm response: `met`, `status`, `detail`, `checked_at`, optional `hit`.

Response highlights (evaluate): `run_id`, `summary`, `strategy_groups[]`, `best_results[]` (matched only).

## Persistence

- Local / SQL tests: in-memory store
- Staging DynamoDB: `*-backtest-runs` keys `premarket#{run_id}` + pointer `premarket#latest`
- Alarm watches: browser `sessionStorage` (`maite.premarket.alarms`)

## Relation to Scanner

Scanner = live polling board. Premarket = intentional batch evaluate + saved envelope + focused alarm watches.
