# Cursor AI — Trading Platform Prompts (v2 summary)

Condensed master + prompts 1–14 for the Maite Trading Strategy Analyzer MVP.

## Master decisions (locked)

- **Equities/ETFs data & routing:** Charles Schwab provider
- **Futures data & routing:** TradeAdvocate provider
- **Auth v1:** no app login; broker OAuth required later for live trading
- **Backtests:** synchronous (request/response)
- **Strategy MVP:** Opening Range Breakout (ORB) long + short
- **Session:** Regular Trading Hours 09:30–16:00 `America/New_York`
- **Infra:** AWS-native CloudFormation (ECR, App Runner, RDS, Amplify) — **no Docker Compose**

## Prompt map

| # | Focus | Outcome |
|---|-------|---------|
| **Master** | Product vision + locked provider/session decisions | Shared context for all agents |
| **1** | Repo skeleton & clean architecture | `backend/app/{domain,ports,providers,strategies,services,api,...}` |
| **2** | Domain model | Candles, signals, trades, instruments, enums |
| **3** | Ports / interfaces | Market data, strategy, broker execution |
| **4** | Providers | Schwab, TradeAdvocate, mock, normalize, factory |
| **5** | ORB strategy | Range N minutes; long/short; reverse; EOD flatten; fill at close |
| **6** | Persistence | SQLAlchemy models + Alembic; unique candles; Timescale if present |
| **7** | Market data service | Validate, upsert, cache, sync by instrument provider |
| **8** | Strategy engine | Evaluate + sync backtest; persist runs/trades/signals |
| **9** | FastAPI surface | `/health`, `/instruments`, `/strategies`, `/market-data/sync`, `/strategy/evaluate`, `/strategy/backtest` |
| **10** | Seed data | Futures→TA: NQ, ES, GC, 6E; Equities→Schwab: AMZN, TSLA, SPY, QQQ |
| **11** | Tests | Architecture, models, providers, MDS, ORB, API — all green |
| **12** | AWS network/secrets/DB | VPC, Secrets Manager, RDS Postgres |
| **13** | AWS API/frontend | ECR + App Runner API; Amplify frontend |
| **14** | Docs & DX | Root README, `.env.example`, package-and-deploy scripts, no Compose |

## ORB acceptance criteria

1. Opening range computed from first N RTH minutes (default 5).
2. Entry long when close breaks above range high; short below range low.
3. Opposite break reverses position.
4. Flat at session end (16:00 ET).
5. Simulated fills use candle **close**.

## Non-goals (v1)

- User accounts / JWT app login
- Live order routing (broker port stubbed)
- Async backtest workers
- Docker Compose local stacks
