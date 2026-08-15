# Maite Trading — Strategy Analyzer Platform

Personal trading research platform for strategy evaluation and historical backtesting.

**v1 scope:** analysis & sync backtests only (no app login, no live order execution).

**Infra model:** AWS-native (CloudFormation YAML). Each service deploys independently on AWS — **no Docker Compose**.

## Architecture

```text
frontend/              Next.js → AWS Amplify Hosting
backend/               FastAPI  → ECR + AWS App Runner
infra/aws/template.yaml        Root CloudFormation stack
infra/aws/nested/              network | secrets | database | api | frontend
```

| Layer | Local | AWS |
|-------|-------|-----|
| Frontend | `npm run dev` | Amplify |
| Backend API | `uvicorn` | App Runner |
| Database | local Postgres or RDS via SSM | RDS PostgreSQL (private) |
| Secrets | `.env` | Secrets Manager |
| IaC | — | `infra/aws/**/*.yaml` |

### Provider routing (MVP)

- **Stocks / ETFs** → Charles Schwab (OAuth2)
- **Futures** → Yahoo Finance chart API (analysis; delayed). Tradovate is execution only.
- Strategy code never talks to brokers directly

### Auth (important)

- **UI gate:** CloudFront HTTP Basic Auth on Options + Futures (browser login prompt; personal desk).
- **Broker authentication is required** (Schwab OAuth2 + Tradovate via Secrets Manager / `.env`).

## AWS templates

Start here: [`infra/aws/README.md`](infra/aws/README.md)

| Template | Service |
|----------|---------|
| [`infra/aws/template.yaml`](infra/aws/template.yaml) | Root stack |
| [`nested/network.yaml`](infra/aws/nested/network.yaml) | VPC / subnets / SGs |
| [`nested/secrets.yaml`](infra/aws/nested/secrets.yaml) | Schwab + Tradovate secrets |
| [`nested/database.yaml`](infra/aws/nested/database.yaml) | RDS PostgreSQL |
| [`nested/api.yaml`](infra/aws/nested/api.yaml) | ECR + App Runner |
| [`nested/frontend.yaml`](infra/aws/nested/frontend.yaml) | Amplify |

Deploy:

```powershell
cd infra/aws
.\scripts\package-and-deploy.ps1 -StackName maite-trading-staging -Region us-east-1 -TemplateBucket YOUR_CFN_BUCKET -DbPassword "LONG_RANDOM_PASSWORD"
```

## AWS deploy

### Recommended (cheap serverless)

Use **Deploy Cheap (SAM)** — Lambda + DynamoDB + S3/CloudFront.

- Docs: [`infra/sam/README.md`](infra/sam/README.md)
- **No manual CloudFormation clicks** — GitHub Action / `sam deploy` creates the stack
- No NAT Gateway, no RDS, no App Runner

### Optional (expensive)

`infra/aws/` App Runner + RDS + NAT — only if you need always-on SQL. Prefer the cheap stack for staging.

See also [`infra/aws/GITHUB_ACTIONS.md`](infra/aws/GITHUB_ACTIONS.md) for OIDC setup (shared by both workflows).

## Local development

### 1. Environment

```bash
cp .env.example .env
```

### 2. Backend

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1   # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- Health: http://localhost:8000/health  
- Docs: http://localhost:8000/docs  

#### Database migrate + seed

Point `DATABASE_URL` (or `DATABASE_HOST` / user / password) at PostgreSQL / RDS, then:

```powershell
cd backend
.\.venv\Scripts\python -m alembic upgrade head
.\.venv\Scripts\python -m scripts.db_cli seed
# or both:
.\.venv\Scripts\python -m scripts.db_cli migrate-and-seed
```

Model/unit tests use in-memory SQLite and do not require Postgres:

```powershell
.\.venv\Scripts\pytest -q
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

App / dashboard: http://localhost:3000

The dashboard calls the FastAPI backend for instruments, strategies, sync, evaluate, backtest, and candles/charts.

## Security notes (v1)

- Never commit `.env`, `.env.local`, or `.secrets/`
- Schwab / Tradovate credentials live in env vars or AWS Secrets Manager only
- UI Basic Auth on Options + Futures; broker OAuth is still required for live market data
- Database should stay private (RDS in private subnets; not publicly open)
- CORS is configured via `CORS_ORIGINS` (default `http://localhost:3000`)

See [`.env.example`](.env.example). In AWS, broker keys live in Secrets Manager (`maite-trading/<env>/app`).

Never commit `.env` or token files under `.secrets/`.

## Implementation roadmap

See [`CURSOR_AI_TRADING_PLATFORM_PROMPTS.md`](CURSOR_AI_TRADING_PLATFORM_PROMPTS.md).

## MVP decisions

- Backtests: **synchronous**
- First strategy: **Opening Range Breakout** (long & short)
- Session: US RTH, `America/New_York`
- Seed symbols: NQ, ES, GC, 6E, AMZN, TSLA, SPY, QQQ
- Deploy target: **AWS CloudFormation** (Amplify + App Runner + RDS)
