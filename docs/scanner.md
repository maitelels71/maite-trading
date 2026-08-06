# Scanner desk

Live market scan board for maite-trading, plus optional saved runs and alert watches.

## UI

Nav tab: **Scanner**

| Control | Action |
|---------|--------|
| Scan now / Auto-refresh | `POST /strategy/scan` — live board |
| Save run | `POST /premarket/evaluate/start` — persist snapshot + `run_id` |
| Load last run | `GET /premarket/evaluate/result` |
| Alert me | Polls `POST /premarket/alarm/check` until `met` |

## What “Save run” means

The live Scanner refreshes and can overwrite what you see. **Save run** stores a snapshot of the full evaluate (all selected strategies × universe) with a `run_id` in DynamoDB (or memory locally). Later you can **Load last run** to recall that exact result without re-scanning.

## What “Alert me” means

You pick one symbol + strategy. The app polls the server every N seconds. When that pair **matches** (setup active), it stops the watch and shows a banner (and a browser notification if allowed). It does not place trades.

## API (shared)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/strategy/scan` | Live scan |
| POST | `/premarket/evaluate/start` | Save snapshot run |
| GET | `/premarket/evaluate/result` | Latest run, or `?run_id=` |
| POST | `/premarket/alarm/check` | One symbol + strategy check |

Alarm watches: browser `sessionStorage` (`maite.scanner.alarms`).
