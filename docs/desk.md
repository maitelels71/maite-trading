# Trading desk layout

## Two apps, one API

Same codebase; build-time `NEXT_PUBLIC_APP_MODE`:

| Mode | Venue | CloudFront |
|------|--------|------------|
| `options` (default) | Schwab · ETFs/Options | Private (HTTP Basic Auth) |
| `futures` | Tradovate · Futures | Private (HTTP Basic Auth) |

Browser prompts for user/password on first visit (saved by the browser). Defaults: `maite` / `maite-options` (Options) and `maite` / `maite-futures` (Futures). Override via GitHub secrets `OPTIONS_BASIC_AUTH_*` / `FUTURES_BASIC_AUTH_*`.

Nav flow (Options): **1 Trading Session → 2 Positions → 3 Analyzer → 4 Journal**.  
Prep under **Desk tools**: Daily · News · Sticky · Checklist · Mind.

## Tabs

| Tab | Where | Purpose |
|-----|--------|---------|
| **Trading Session** | Primary | Scan, plan, capital 1%, open to Schwab |
| **Positions** | Primary (Options) | Open positions, TP 10/20/35, closes |
| **Analyzer** | Primary | Deep-dive one symbol |
| **Journal** | Primary | Trade → Notion |
| **Daily / News / …** | Desk tools | Prep & reference (not in live click path) |

Theme: **Light / Dark** toggle in the top nav (`maite.theme`).

## Daily review

Checklist inspired by discretionary process: calendar, bias, levels, risk limits, no revenge, journal. Persisted in `localStorage` per NY date (`maite.daily-review.YYYY-MM-DD`).

**Save to Notion** calls `POST /daily/notion` and upserts one page per NY date into the Notion **Daily Review** database (`NOTION_API_KEY` + `NOTION_DATABASE_ID` in Secrets Manager). Re-saving the same date updates that page.

## Trade journal

Tab **Journal** → `POST /journal/notion` creates one Notion page per trade in **Trade Journal Desk** (`NOTION_JOURNAL_DATABASE_ID`). Fields: Activo, Side, Session, Playbook, TF, Entry/SL/TP/BE, R, PnL, stuck-to-plan, thesis / what happened / lesson. Screenshots: up to 3 before (1H / 15m / entry) and 2 after; compressed in-browser and uploaded via Notion File Upload API.

## Trading Session

Playbooks in `frontend/src/lib/playbooks.ts` are tagged with `venue`: `schwab` (ETFs/Options) or `tradeadvocate` (Futures). Each desk locks the scan to that data provider.

### Futures (Tradovate)

- **ML01** (`ml01_structure_choch_bos`) — Major 1H structure (HH/HL) + 15m ChoCh/BOS entry. First futures playbook.

### ETFs / Options (Schwab)

Bollinger options system: **E01 → E02 → E03 → E04** (Schwab). ORB playbooks removed from the desk UI.

- **E04** (`bb15_gap_open`) — Scan ready
- **E03** (`magnet_ma20_gap`) — Scan ready  
- **E01–E02** — checklist-only until wired

### Futures (Tradovate)

No playbooks in the desk yet (ORB FUT removed). Add futures books when ready.

### Futures data (analysis)

The futures desk scans like options: candles only. Universe: **MNQ · MES · EURUSD · GBPUSD · AUDUSD · GC** via Yahoo (`MNQ=F`, `MES=F`, `6E=F`, `6B=F`, `6A=F`, `GC=F`). Delayed ~10–15 minutes; no API key. Tradovate / MFF is for execution only — not required for Analyzer or ML01.