# Backend Architecture

Clean architecture layout for the Maite Trading Strategy Analyzer API.

## Layers

| Layer | Path | Responsibility |
|-------|------|----------------|
| API | `app/api` | FastAPI routers, request/response mapping |
| Schemas | `app/schemas` | Pydantic DTOs |
| Services | `app/services` | Use-cases: market-data sync, strategy engine |
| Strategies | `app/strategies` | Pure strategy logic (ORB) |
| Providers | `app/providers` | Schwab (equities), TradeAdvocate (futures), mock |
| Ports | `app/ports` | Interfaces for market data, strategy, broker execution |
| Domain | `app/domain` | Enums, candles, signals, trades, instruments |
| Models | `app/models` | SQLAlchemy ORM |
| Database | `app/database` | Engine/session, seed |
| Core | `app/core` | Config, constants, logging |

## Dependency rule

`api → services → (strategies | providers | models)`  
Domain and ports have no outward dependencies on frameworks.

## MVP decisions

- Stocks/ETFs → Charles Schwab provider
- Futures → TradeAdvocate provider
- No app login in v1; broker OAuth later
- Backtests are synchronous
- ORB long+short, RTH `America/New_York`
- AWS-native CloudFormation (no Docker Compose)

## Key endpoints

- `GET /health`
- `GET /instruments`
- `GET /strategies`
- `POST /market-data/sync`
- `POST /strategy/evaluate`
- `POST /strategy/backtest`
