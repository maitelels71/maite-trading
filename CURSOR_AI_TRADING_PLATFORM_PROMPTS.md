# Trading Strategy Analyzer Platform
# Complete Cursor AI Prompt Instructions

Version: 2.0

---

# MVP DECISIONS (LOCKED)

These decisions are fixed for v1. Do not reinvent them.

| Decision | Value |
|----------|-------|
| App user auth (login/JWT/multi-tenant) | **Not in v1** — personal use only |
| Broker authentication | **Required** — Charles Schwab OAuth2 + TradeAdvocate API auth via env/secrets |
| Equities & ETFs data | **Charles Schwab** |
| Futures data | **TradeAdvocate** |
| Order execution / tickets | **Future only** — TradeAdvocate for futures; prepare ports, do not implement |
| Backtesting mode | **Synchronous** |
| First strategy | **Opening Range Breakout (ORB)** — long and short |
| Session / timezone | US RTH, `America/New_York` |
| Opening range | Configurable; default **5 minutes** |
| Instruments (seed) | Futures: NQ, ES, GC, 6E · Equities/ETFs: AMZN, TSLA, SPY, QQQ |
| Timeframes | 1m, 5m, 15m, 30m, 1h, 4h, Daily |

### Auth clarification (critical)

- **App auth** = user login to this platform → skip in v1.
- **Broker auth** = OAuth/API credentials to Schwab and TradeAdvocate → implement in v1.
- Store tokens and secrets in environment variables / secret manager. Never commit credentials.
- Strategy engine must never call brokers directly; only through provider interfaces.

### Provider routing

```text
MarketDataProvider (interface)
├── SchwabProvider           → market_type in {stock, etf}
└── TradeAdvocateProvider    → market_type = future

BrokerExecutionPort (future phase only)
└── TradeAdvocateBroker      → futures order tickets
```

Route by `instrument.market_type`. Do not hardcode symbol → provider maps inside strategies.

---

# MASTER PROMPT

You are a senior software architect and full-stack developer.

Your task is to build a professional trading strategy analysis platform.

The application must be designed as a modular system capable of:

- Connecting to financial market data providers (Schwab + TradeAdvocate).
- Storing historical market data.
- Evaluating trading strategies.
- Performing historical backtesting (synchronous in v1).
- Supporting multiple instruments and multiple strategies.
- Being deployed on AWS.

The application is initially for personal use but must be designed for future SaaS expansion (add app auth later without rewriting core domains).

Do not create a monolithic application.

Follow clean architecture principles.

Separate:

- Frontend
- Backend
- Database
- Market Data Providers
- Strategy Engine
- (Future) Broker Execution

Before writing code for any prompt:

1. Analyze existing architecture.
2. Explain the implementation plan briefly.
3. Create files step-by-step.
4. Do not skip database design.
5. Do not create temporary solutions.
6. Keep modules independent.
7. Write production-quality code.
8. Document every major component.

---

# PROJECT TECHNOLOGY REQUIREMENTS

## Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS

Purpose:

- Select instruments, strategies, timeframes, dates
- Run evaluate / backtest
- View metrics, trades, and charts

## Backend

- Python
- FastAPI
- SQLAlchemy
- Alembic
- Pydantic

Responsibilities:

- REST API
- Business logic
- Strategy execution
- Database access
- Market data integration (provider adapters)

## Database

- PostgreSQL
- TimescaleDB extension

Optimize for:

- Historical candle queries
- Backtesting ranges
- Time-range analysis

Candles must be stored with time-series friendly indexes.
On AWS v1 use RDS PostgreSQL; Timescale hypertables may be introduced later via Timescale Cloud or a self-hosted path without changing domain interfaces.

## Local infrastructure

- Local: run FastAPI + Next.js on the developer machine; optional local PostgreSQL
- AWS (source of truth): CloudFormation YAML under `infra/aws/`
  - Amplify (frontend)
  - App Runner + ECR (backend)
  - RDS PostgreSQL (database)
  - Secrets Manager (Schwab + TradeAdvocate)
- `.env.example` with all required variables (no real secrets)
- **Do not use Docker Compose** for this project

---

# PROMPT 1
# Create Project Structure

Create the initial project structure.

## Requirements

Create two main applications:

```text
/frontend
/backend
```

Also create AWS infrastructure as code (required):

```text
/infra/aws
  template.yaml                 # root CloudFormation stack
  nested/
    network.yaml
    secrets.yaml
    database.yaml
    api.yaml                    # ECR + App Runner
    frontend.yaml               # Amplify
  parameters/
    staging.example.json
  scripts/
    package-and-deploy.ps1
    package-and-deploy.sh
  README.md
.env.example
README.md
```

Do **not** create Docker Compose files.

### Frontend stack

- Next.js
- TypeScript
- Tailwind CSS

### Backend stack

- FastAPI
- Python
- SQLAlchemy
- Alembic
- Pydantic

### Configuration

- Environment-based settings (database URL / RDS vars, Schwab OAuth, TradeAdvocate credentials, app config)
- AWS Secrets Manager ARNs supported for deployed environments
- No business logic yet
- README with: local run, AWS deploy via CloudFormation templates, architecture overview

### Acceptance criteria

- [ ] Repo structure exists
- [ ] Backend starts (health endpoint ok)
- [ ] Frontend starts
- [ ] `infra/aws/template.yaml` + nested service templates exist
- [ ] `.env.example` documents broker auth vars without real secrets
- [ ] No Docker Compose in the repo

---

# PROMPT 2
# Backend Clean Architecture

Create backend clean architecture.

## Target structure

```text
backend/
  app/
    api/           # REST endpoints (routers)
    core/          # settings, logging, constants
    database/      # engine, session, base
    models/        # SQLAlchemy entities
    schemas/       # Pydantic API contracts
    services/      # business logic / use cases
    strategies/    # strategy interface + implementations
    providers/     # MarketDataProvider + Schwab + TradeAdvocate
    ports/         # interfaces / protocols (optional if kept in providers)
    domain/        # pure domain types if needed
    tests/
```

## Responsibilities

| Module | Responsibility |
|--------|----------------|
| api | REST endpoints only — no business rules |
| database | connection, sessions, migrations entry |
| models | DB entities |
| schemas | request/response contracts |
| services | orchestration / use cases |
| strategies | trading algorithms |
| providers | external market data integrations |

## Rules

- Strategies must depend on candle/signal types, not on Schwab or TradeAdvocate.
- Providers implement a shared `MarketDataProvider` interface.
- Services orchestrate: load instruments → fetch/store candles → run strategy → return results.

### Acceptance criteria

- [ ] Folder structure created
- [ ] Interfaces/protocols defined for `MarketDataProvider` and `Strategy`
- [ ] No circular imports between strategies and providers

---

# PROMPT 3
# Database Implementation

Create PostgreSQL + TimescaleDB schema with SQLAlchemy models and Alembic migrations.

## Tables

### instruments

| Field | Notes |
|-------|-------|
| id | PK |
| symbol | e.g. SPY, NQ |
| name | human-readable |
| market_type | enum: `stock`, `etf`, `future` |
| exchange | nullable |
| data_provider | enum: `schwab`, `tradeadvocate` |
| active | bool |
| created_at | timestamptz |

Unique: `(symbol, market_type)`

### candles

| Field | Notes |
|-------|-------|
| id | PK (or composite without id if preferred) |
| instrument_id | FK → instruments |
| timestamp | timestamptz, UTC stored |
| timeframe | e.g. `1m`, `5m`, `1h`, `1d` |
| open, high, low, close | numeric |
| volume | numeric |
| created_at | timestamptz |

Constraints / indexes:

- UNIQUE `(instrument_id, timeframe, timestamp)`
- Index `(instrument_id, timeframe, timestamp)`
- Convert to TimescaleDB **hypertable** on `timestamp` (via Alembic raw SQL)

### strategies

| Field | Notes |
|-------|-------|
| id | PK |
| name | unique |
| description | text |
| version | string |
| parameters | JSON (e.g. opening_range_minutes) |
| status | `active` / `inactive` |
| created_at | timestamptz |

### backtest_runs

| Field | Notes |
|-------|-------|
| id | PK / UUID |
| strategy_id | FK |
| instrument_id | FK |
| timeframe | string |
| start_date | date/timestamptz |
| end_date | date/timestamptz |
| parameters | JSON snapshot |
| status | `completed` / `failed` |
| metrics | JSON (win rate, PnL, drawdown, etc.) |
| error_message | nullable |
| created_at | timestamptz |

### trades

| Field | Notes |
|-------|-------|
| id | PK |
| backtest_run_id | FK |
| side | `long` / `short` |
| signal | e.g. `breakout_high`, `breakout_low` |
| entry_time | timestamptz |
| entry_price | numeric |
| exit_time | nullable |
| exit_price | nullable |
| profit_loss | nullable |
| notes | nullable |

### signals (optional but recommended)

| Field | Notes |
|-------|-------|
| id | PK |
| backtest_run_id | FK nullable (or evaluate_run id) |
| instrument_id | FK |
| strategy_id | FK |
| timestamp | timestamptz |
| side | `long` / `short` / `flat` |
| reason | text |
| price | numeric |

## Do not use a single “strategy_results” table

Separate runs, trades, and signals. Do not mix concerns.

### Acceptance criteria

- [ ] Alembic migration creates all tables
- [ ] Candles hypertable created
- [ ] Unique constraint prevents duplicate candles
- [ ] Seed script or migration seeds MVP instruments with correct `data_provider`

---

# PROMPT 4
# Market Data Providers (Schwab + TradeAdvocate)

Create market data provider layer.

## Interface

```text
MarketDataProvider
  - authenticate() / ensure_authenticated()
  - get_historical_candles(symbol, timeframe, start, end) -> list[NormalizedCandle]
```

Normalized candle output **must always** be:

```text
timestamp
open
high
low
close
volume
ticker
timeframe
```

## Implementations

### SchwabProvider

- OAuth2 authentication (Charles Schwab)
- Historical candles for **stocks and ETFs**
- Normalize vendor payload → `NormalizedCandle`

### TradeAdvocateProvider

- API authentication as required by TradeAdvocate
- Historical candles for **futures**
- Normalize vendor payload → `NormalizedCandle`

## Rules

- Do **not** connect strategy logic directly to either broker.
- Select provider from `instrument.data_provider` or `instrument.market_type`.
- Persist refresh tokens / secrets securely (env + DB token store only if needed; never hardcode).
- Handle rate limits with clear errors.
- If TradeAdvocate historical API details are incomplete, implement the adapter interface + clear TODOs and a mock provider for local tests — do not fake production credentials.

### Acceptance criteria

- [ ] Shared interface exists
- [ ] Both providers implement it
- [ ] Provider factory/router by market type
- [ ] Unit tests with mocked HTTP responses

---

# PROMPT 5
# Market Data Service

Create `MarketDataService`.

## Responsibilities

- Resolve instrument
- Choose correct provider
- Request candles from provider
- Validate OHLCV data
- Upsert candles into TimescaleDB
- Retrieve candles by range for analysis

## Methods

- `sync_historical_data(symbol, timeframe, start, end)`
- `save_candles(instrument_id, timeframe, candles)`
- `get_candles_by_range(instrument_id, timeframe, start, end)`

## Rules

- Prefer DB cache: if candles already exist for range, return DB data unless `force_refresh=true`
- Validate: high >= low, timestamp monotonicity, no negatives for prices
- Never let API layer talk to providers directly; go through this service

### Acceptance criteria

- [ ] Sync persists normalized candles
- [ ] Range query returns ordered candles
- [ ] Duplicate sync does not create duplicate rows

---

# PROMPT 6
# Strategy Engine Framework

Create a generic strategy framework.

```text
StrategyEngine
    └── Strategy (interface)
            ├── OpeningRangeBreakoutStrategy
            └── (future strategies)
```

## Strategy interface

Every strategy must implement something equivalent to:

```text
evaluate(candles, context) -> StrategyResult
```

### Input context

- ticker / instrument
- timeframe
- date_range
- parameters (JSON)
- session timezone (`America/New_York`)
- session type (RTH for v1)

### Output (`StrategyResult`)

- signals[]
- trades[] (entry/exit/side/reason)
- metrics (for the evaluated window)

## Engine responsibilities

- Load candles via MarketDataService
- Instantiate strategy by name/id
- Run evaluate
- Optionally persist backtest_run + trades when in backtest mode

### Acceptance criteria

- [ ] New strategies can be added without changing providers
- [ ] Engine does not import Schwab/TradeAdvocate modules

---

# PROMPT 7
# First Strategy — Opening Range Breakout (ORB)

Implement **Opening Range Breakout**.

## Rules

1. Use US RTH session in `America/New_York`.
2. Identify the opening range using the first N minutes (default N=5; parameter `opening_range_minutes`).
3. Store range high and low.
4. **Long:** breakout above range high → open long.
5. **Short:** breakout below range low → open short.
6. Define explicit exit rules for v1 (document and implement one clear model), e.g.:
   - opposite breakout exits/flips, or
   - end-of-session flat
7. Support **long and short**.
8. Generate signals with reasons.
9. Return entry/exit information and per-window metrics.

## Must work with

- Futures: NQ, ES, GC, 6E (TradeAdvocate data)
- Stocks/ETFs: AMZN, TSLA, SPY, QQQ (Schwab data)

Do **not** hardcode symbols inside the strategy.

## Parameters (JSON)

- `opening_range_minutes` (default 5)
- `session` = `RTH`
- `timezone` = `America/New_York`
- exit policy parameters as needed

### Acceptance criteria

- [ ] Unit tests with synthetic candles for long and short paths
- [ ] Strategy works given candles only (no broker calls)
- [ ] Parameters are not hardcoded magically outside strategy config

---

# PROMPT 8
# Evaluation & Backtest API

Create REST endpoints with explicit contracts.

## Endpoints

### GET /health

Returns service health.

### GET /instruments

List active instruments (symbol, market_type, data_provider).

### GET /strategies

List strategies (name, description, parameters schema/defaults).

### POST /market-data/sync

Sync historical candles for an instrument/timeframe/range.

### POST /strategy/evaluate

Evaluate strategy for a **single session/day** (sync).

**Request example:**

```json
{
  "ticker": "SPY",
  "strategy": "opening_range_breakout",
  "timeframe": "5m",
  "date": "2026-07-15",
  "parameters": {
    "opening_range_minutes": 5
  }
}
```

**Response includes:** signals, trades for that day, metrics for that day.

Note: ORB needs the full session; `date` is the session date. Do not require a meaningless single `time` unless used as as-of cutoff.

### POST /strategy/backtest

Run **synchronous** backtest over a date range.

**Request example:**

```json
{
  "ticker": "NQ",
  "strategy": "opening_range_breakout",
  "timeframe": "5m",
  "start_date": "2026-01-01",
  "end_date": "2026-03-31",
  "parameters": {
    "opening_range_minutes": 5
  }
}
```

**Response example fields:**

```json
{
  "run_id": "uuid",
  "total_trades": 40,
  "winning_trades": 22,
  "losing_trades": 18,
  "win_rate": 0.55,
  "profit_loss": 1250.5,
  "max_drawdown": 320.0,
  "trades": [],
  "equity_curve": []
}
```

## v1 backtest assumptions (document in code)

- Sync execution only
- Explicit fill model (prefer next-bar open or signal-bar close — pick one and document)
- Optional simple commission/slippage parameters (default 0 ok for v1, but fields should exist)
- Long and short enabled for ORB

### Acceptance criteria

- [ ] OpenAPI docs show request/response models
- [ ] Evaluate and backtest both work end-to-end against DB candles
- [ ] Futures ticker routes to TradeAdvocate-backed instrument; equity to Schwab-backed instrument

---

# PROMPT 9
# Testing

Create automated tests **before** polishing UI and AWS.

## Backend tests

- Unit tests: ORB long/short, range detection, session boundaries
- Unit tests: MarketDataService validation + upsert behavior
- API tests: instruments, strategies, evaluate, backtest
- Provider tests: mocked Schwab and TradeAdvocate responses

## Rules

- Use synthetic candles for strategy tests
- Do not call real broker APIs in CI
- Prefer fast, deterministic tests

### Acceptance criteria

- [ ] `pytest` passes locally
- [ ] ORB long and short covered
- [ ] Duplicate candle upsert covered

---

# PROMPT 10
# Frontend Dashboard

Create the analysis dashboard.

## Features

### Instrument selector

Seed options:

- NQ, ES, GC, 6E
- AMZN, TSLA, SPY, QQQ

Show market type in UI.

### Strategy selector

Load from `GET /strategies`.

### Timeframe selector

- 1m, 5m, 15m, 30m, 1h, 4h, Daily

### Date controls

- Specific date (evaluate)
- Date range (backtest)

### Actions

- Sync data (optional button)
- Run evaluate
- Run backtest

### Results panel

- Metrics: total trades, win rate, PnL, max drawdown
- Trades table
- Loading and error states

Wire to backend APIs. No fake hardcoded results in production path.

### Acceptance criteria

- [ ] User can run evaluate and backtest from UI
- [ ] Results render from API response
- [ ] Works for one equity and one futures symbol

---

# PROMPT 11
# Chart Visualization

Add financial charts.

## Display

- Candlestick chart
- Entry points
- Exit points
- Strategy signals (long/short markers)

Use a professional trading chart library (e.g. TradingView Lightweight Charts or equivalent).

Chart data should come from candles + evaluate/backtest payloads.

### Acceptance criteria

- [ ] Candles render for selected range
- [ ] Entries/exits visible for long and short
- [ ] Chart updates after a new run

---

# PROMPT 12
# Security Review

Perform a security review and fix issues.

## Verify

- No credentials in code or git
- Environment variables / secrets used for Schwab and TradeAdvocate
- Refresh tokens protected
- Database not exposed publicly in local/prod docs
- Pydantic input validation on all write endpoints
- CORS configured intentionally
- Least-privilege AWS notes in deployment docs

App user auth remains out of scope for v1, but broker secrets must be treated as production secrets.

### Acceptance criteria

- [ ] Secret scan clean for obvious keys
- [ ] `.env` gitignored
- [ ] Security notes added to README

---

# PROMPT 13
# AWS Deployment (CloudFormation)

This project is AWS-native. Keep CloudFormation templates current as services evolve.

## Target services (already scaffolded under infra/aws)

| Layer | AWS resource | Template |
|-------|--------------|----------|
| Frontend | Amplify Hosting | `nested/frontend.yaml` |
| Backend | App Runner + ECR | `nested/api.yaml` |
| Database | RDS PostgreSQL | `nested/database.yaml` |
| Secrets | Secrets Manager | `nested/secrets.yaml` |
| Network | VPC / subnets / SGs | `nested/network.yaml` |
| Root | Nested stack orchestrator | `template.yaml` |
| Monitoring | CloudWatch Logs | defined with API / RDS |

## Deliverables

- Keep Dockerfiles only as **container build inputs for ECR/App Runner** (not Compose)
- Deployment docs in `infra/aws/README.md`
- Parameter files per stage (`staging`, later `production`)
- Broker secrets only in Secrets Manager in AWS

## Notes

- Nested templates must be packaged to S3 before deploy (`scripts/package-and-deploy.*`)
- RDS PostgreSQL is the v1 managed DB; Timescale can be introduced later (Timescale Cloud or self-hosted) without changing provider/strategy interfaces

### Acceptance criteria

- [ ] `aws cloudformation package` + `deploy` documented and scripts work
- [ ] Each service has its own nested YAML template
- [ ] No secrets baked into images or templates
- [ ] No Docker Compose usage

---

# PROMPT 14
# Future Phase Preparation (Do Not Implement)

Prepare architecture only — stubs/ports/docs — for:

## Real-time scanner

Every minute (or on new candle):

1. Get latest candle
2. Evaluate strategies
3. Generate signal

## Alerts

- Email: Amazon SES
- SMS: Amazon SNS

## Trading automation

- Broker connection for **futures tickets via TradeAdvocate**
- Optional later path for equities via Schwab if needed
- Order execution
- Risk management (max daily loss, position size caps)

Define interfaces such as:

```text
BrokerExecutionPort
  - place_order()
  - cancel_order()
  - get_positions()
```

Implementations stay unimplemented (raise `NotImplementedError` or empty adapter), except documentation of how TradeAdvocate will plug in.

### Acceptance criteria

- [ ] Ports/interfaces exist
- [ ] No live order placement code paths enabled
- [ ] README “Future phases” section documents the plan

---

# FINAL CURSOR INSTRUCTION

Work prompt-by-prompt in order (1 → 14).

For each prompt:

1. Analyze what already exists.
2. Explain a short implementation plan.
3. Implement only that prompt’s scope.
4. Satisfy acceptance criteria before moving on.
5. Keep providers replaceable and strategies broker-agnostic.
6. Prefer clarity over cleverness.

The final application must be a professional trading research platform:

- Schwab for stocks/ETFs market data
- TradeAdvocate for futures market data
- Sync backtests
- ORB long/short
- No app login in v1
- Broker OAuth/API auth required
- Clean architecture ready for SaaS and live trading later
