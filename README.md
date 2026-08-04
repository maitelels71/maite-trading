# Maite Trading Strategy Analyzer

Multi-asset strategy analyzer: **Schwab** for stocks/ETFs, **TradeAdvocate** for futures.
Backtests are synchronous. No app login in v1 (broker OAuth later). Deployed with **AWS CloudFormation** (no Docker Compose).

## Architecture

```
frontend/          Next.js dashboard + Lightweight Charts
backend/           FastAPI clean architecture
  app/
    api/           HTTP endpoints
    services/      market-data sync + strategy engine
    strategies/    Opening Range Breakout (ORB)
    providers/     schwab, tradeadvocate, mock
    domain/        candles, signals, trades, instruments
    models/        SQLAlchemy ORM
infra/aws/         Nested CloudFormation (VPC, RDS, App Runner, Amplify)
```

### MVP instruments

| Symbol | Class | Provider |
|--------|-------|----------|
| NQ, ES, GC, 6E | Futures | TradeAdvocate |
| AMZN, TSLA, SPY, QQQ | Stocks/ETFs | Schwab |

### ORB rules

- RTH 09:30–16:00 `America/New_York`
- Opening range = first N minutes (default 5)
- Long above high / short below low; reverse on opposite; flat end of session
- Fills at candle close

## Local run

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example ../.env  # optional; mocks enabled by default
uvicorn app.main:app --reload --port 8000
```

### Migrate and seed (Postgres)

```bash
export DATABASE_URL=postgresql+psycopg2://maite:maite@localhost:5432/maite
cd backend
python scripts/db_cli.py migrate-and-seed
```

### Frontend dashboard

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000

Dashboard features:

- Instrument / strategy / timeframe selectors
- Evaluate (single session day) or backtest (date range)
- Metrics, trades table, candlestick chart with long/short markers
- Falls back to seed instrument list if API is offline

### Tests

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest -q
```

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness |
| GET | `/instruments` | MVP instruments |
| GET | `/strategies` | Registered strategies |
| POST | `/market-data/sync` | Fetch + upsert candles |
| POST | `/strategy/evaluate` | Run strategy on provided candles |
| POST | `/strategy/backtest` | Sync (optional) + evaluate + persist |

## AWS deploy

See [`infra/aws/README.md`](infra/aws/README.md).

```bash
cd infra/aws
./scripts/package-and-deploy.sh <s3-bucket> maite-staging parameters/staging.example.json us-east-1
```

Then migrate-and-seed against RDS and push the API image to ECR for App Runner.

## Docs

- Backend architecture: `backend/ARCHITECTURE.md`
- Build prompts summary: `CURSOR_AI_TRADING_PLATFORM_PROMPTS.md`
