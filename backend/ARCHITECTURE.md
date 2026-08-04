"""Architecture overview for contributors."""

# Maite Trading backend layers
#
# api/         HTTP adapters (FastAPI routers) — no business rules
# schemas/     Pydantic request/response DTOs
# services/    Use cases (MarketDataService, StrategyEngine)
# strategies/  Broker-agnostic algorithms (ORB, …)
# providers/   Schwab + TradeAdvocate adapters
# ports/       Protocols (MarketDataProvider, Strategy, BrokerExecutionPort)
# domain/      Pure types (Candle, Signal, Trade, …)
# models/      SQLAlchemy entities (Prompt 3)
# database/    Engine / sessions
# core/        Settings, logging, constants
#
# Dependency direction:
#   api → services → (strategies | providers | database)
#   strategies → domain only
#   providers → domain + ports (+ HTTP SDKs later)
#   NEVER: strategies → providers
