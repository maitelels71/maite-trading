# Trading desk layout

## Two apps, one API

Same codebase; build-time `NEXT_PUBLIC_APP_MODE`:

| Mode | Venue | CloudFront |
|------|--------|------------|
| `options` (default) | Schwab · ETFs/Options | Public |
| `futures` | TradeAdvocate · Futures | Private (HTTP Basic Auth) |

Nav flow (both): **1 News → 2 Daily → 3 Strategies → 4 Analyzer → 5 Journal** (+ Mind / Admin).

## Tabs

| Tab | Purpose |
|-----|---------|
| **News** | Macro calendar + session headlines |
| **Daily** | Pre-open / session / post checklist + bias + notes |
| **Strategies** | Playbooks + live scan for this app’s venue only |
| **Analyzer** | Deep-dive one symbol (venue locked to app mode) |
| **Journal** | Trade form → Notion Trade Journal Desk |
| **Mind** | Psychotrading ritual / mantras |
| **Admin** | Schwab token + Secrets Manager publish |

Theme: **Light / Dark** toggle in the top nav (`maite.theme`).

## Daily review

Checklist inspired by discretionary process: calendar, bias, levels, risk limits, no revenge, journal. Persisted in `localStorage` per NY date (`maite.daily-review.YYYY-MM-DD`).

**Save to Notion** calls `POST /daily/notion` and upserts one page per NY date into the Notion **Daily Review** database (`NOTION_API_KEY` + `NOTION_DATABASE_ID` in Secrets Manager). Re-saving the same date updates that page.

## Trade journal

Tab **Journal** → `POST /journal/notion` creates one Notion page per trade in **Trade Journal Desk** (`NOTION_JOURNAL_DATABASE_ID`). Fields: Activo, Side, Session, Playbook, TF, Entry/SL/TP/BE, R, PnL, stuck-to-plan, thesis / what happened / lesson. Screenshots: up to 3 before (1H / 15m / entry) and 2 after; compressed in-browser and uploaded via Notion File Upload API.

## Strategies

Playbooks in `frontend/src/lib/playbooks.ts` are tagged with `venue`: `schwab` (ETFs/Options) or `tradeadvocate` (Futures). Each desk locks the scan to that data provider.

### Futures (TradeAdvocate)

- **ML01** (`ml01_structure_choch_bos`) — Major 1H structure (HH/HL) + 15m ChoCh/BOS entry. First futures playbook.

### ETFs / Options (Schwab)

Bollinger options system: **E01 → E02 → E03 → E04** (Schwab). ORB playbooks removed from the desk UI.

- **E04** (`bb15_gap_open`) — Scan ready
- **E03** (`magnet_ma20_gap`) — Scan ready  
- **E01–E02** — checklist-only until wired

### Futures (TradeAdvocate)

No playbooks in the desk yet (ORB FUT removed). Add futures books when ready.

### Futures data (analysis)

The futures desk scans like options: candles only. It uses the same Schwab token (`SCHWAB_*`). Desk symbols `NQ` / `MNQ` / `ES` / `MES` map to Schwab `/NQ`, `/MNQ`, `/ES`, `/MES`. Tradovate / MFF is not required for Analyzer or ML01.