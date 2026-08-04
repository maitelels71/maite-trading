La idea es que no sea solamente una descripción del proyecto, sino un plan de trabajo para Cursor:

Entender el proyecto.
Crear la arquitectura.
Crear la base de datos.
Crear backend.
Crear frontend.
Conectar Schwab API.
Implementar motor de estrategias.
Preparar futuras fases.

Guárdalo como:

CURSOR_AI_TRADING_PLATFORM_PROMPTS.md
# Trading Strategy Analyzer Platform
# Complete Cursor AI Prompt Instructions

Version: 1.0

---

# MASTER PROMPT

You are a senior software architect and full-stack developer.

Your task is to build a professional trading strategy analysis platform.

The application must be designed as a modular system capable of:

- Connecting to financial market data providers.
- Storing historical market data.
- Evaluating trading strategies.
- Performing historical backtesting.
- Supporting multiple instruments.
- Supporting multiple strategies.
- Being deployed on AWS.

The application is initially for personal use but must be designed for future SaaS expansion.

Do not create a monolithic application.

Follow clean architecture principles.

Separate:

- Frontend.
- Backend.
- Database.
- Market Data Provider.
- Strategy Engine.

---

# PROJECT TECHNOLOGY REQUIREMENTS

## Frontend

Use:

- Next.js
- React
- TypeScript
- Tailwind CSS

Purpose:

Create the user interface for:

- Selecting instruments.
- Selecting strategies.
- Selecting timeframes.
- Selecting dates.
- Viewing analysis results.
- Displaying charts.

---

## Backend

Use:

- Python
- FastAPI

Responsibilities:

- REST API.
- Business logic.
- Strategy execution.
- Database access.
- Market data integration.

---

## Database

Use:

- PostgreSQL
- TimescaleDB extension.

Reason:

Financial market candles are time-series data.

The database must be optimized for:

- Historical queries.
- Backtesting.
- Time-range analysis.

---

# PROMPT 1
# Create Project Structure

Create the initial project structure.

Requirements:

Create two main applications:


/frontend

/backend


Frontend:


Next.js
TypeScript
Tailwind


Backend:


FastAPI
Python
SQLAlchemy
Alembic
Pydantic


Create configuration files.

Create README.md.

Create environment configuration.

Do not implement business logic yet.

---

# PROMPT 2
# Backend Architecture

Create backend clean architecture.

Structure:


backend

/app

/api

/core

/database

/models

/schemas

/services

/strategies

/providers

/tests

Responsibilities:

api:
REST endpoints

database:
connection and migrations

models:
database entities

schemas:
API contracts

services:
business logic

strategies:
trading algorithms

providers:
external integrations

---

# PROMPT 3
# Database Implementation

Create PostgreSQL database schema.

Use SQLAlchemy models.

Create tables:

---

## Instruments

Fields:


id

symbol

name

market_type

exchange

active

created_at


---

## Candles

Fields:


id

instrument_id

timestamp

timeframe

open

high

low

close

volume

created_at


Create index:


instrument_id

timeframe

timestamp


Optimize for historical queries.

---

## Strategies

Fields:


id

name

description

version

status

created_at


---

## Strategy Results

Fields:


id

strategy_id

instrument_id

timestamp

signal

entry_price

exit_price

profit_loss

notes


Create migrations using Alembic.

---

# PROMPT 4
# Schwab Market Data Integration

Create a market data provider service.

Do not connect strategy logic directly to Schwab.

Create:


MarketDataProvider Interface


Implementation:


SchwabProvider


Capabilities:

- Authenticate using OAuth2.
- Retrieve historical candles.
- Normalize data.

The provider output must always return:


timestamp

open

high

low

close

volume

ticker

timeframe


---

# PROMPT 5
# Market Data Service

Create MarketDataService.

Responsibilities:

- Request candles from provider.
- Validate data.
- Store candles.
- Retrieve candles for analysis.

Methods:

Example:


get_historical_data()

save_candles()

get_candles_by_range()


---

# PROMPT 6
# Strategy Engine

Create a generic strategy framework.

Architecture:


StrategyEngine

    |

Strategy Interface

    |

Strategy 1

Strategy 2

Strategy N


Every strategy must implement:


evaluate()


Input:


candles

ticker

timeframe

date_range


Output:


signal

entry

exit

reason

metrics


---

# PROMPT 7
# First Trading Strategy

Implement the first strategy.

Name:

Opening Range Breakout

Rules:

1. Identify the first 5-minute candle.
2. Store high and low.
3. Detect breakout above high.
4. Detect breakout below low.
5. Generate signal.
6. Return entry information.

The strategy must work with:

- NQ
- ES
- Stocks
- ETFs

Do not hardcode symbols.

---

# PROMPT 8
# Evaluation API

Create REST endpoints.

Required endpoints:

## Get Instruments


GET /instruments



## Get Strategies


GET /strategies



## Evaluate Strategy


POST /strategy/evaluate


Input:


ticker

strategy

timeframe

date

time


---

## Backtest Strategy


POST /strategy/backtest


Input:


ticker

strategy

start_date

end_date

timeframe


Output:


total trades

winning trades

losing trades

win rate

profit loss

drawdown


---

# PROMPT 9
# Frontend Dashboard

Create dashboard.

Features:

## Instrument Selector

Options:

- NQ
- ES
- GC
- 6E
- AMZN
- TSLA
- SPY
- QQQ


## Strategy Selector

Load from backend.

## Timeframe Selector

Options:

- 1m
- 5m
- 15m
- 30m
- 1h
- 4h
- Daily


## Date Selector

Allow:

- Specific date.
- Date range.

---

# PROMPT 10
# Chart Visualization

Add financial charts.

Display:

- Candlestick chart.
- Entry points.
- Exit points.
- Strategy signals.

Use a professional trading chart library.

---

# PROMPT 11
# AWS Deployment

Prepare application for AWS.

Use:

Frontend:

- AWS Amplify or ECS


Backend:

- AWS ECS or App Runner


Database:

- Amazon RDS PostgreSQL


Storage:

- Amazon S3


Monitoring:

- CloudWatch


Create:

- Docker files.
- Deployment documentation.
- Environment configuration.

---

# PROMPT 12
# Security Review

Perform security review.

Verify:

- No credentials in code.
- Environment variables used.
- API keys protected.
- Database secured.
- Input validation implemented.

---

# PROMPT 13
# Testing

Create tests.

Backend:

- Unit tests.
- API tests.
- Strategy tests.

Test:

- Database operations.
- Market data service.
- Strategy calculations.

---

# PROMPT 14
# Future Phase Preparation

Prepare architecture for:

## Real-Time Scanner

Future:

Every minute:


Get candle

Evaluate strategies

Generate signal


---

## Alerts

Future:

Email:

Amazon SES

SMS:

Amazon SNS

---

## Trading Automation

Future:

- Broker connection.
- Order execution.
- Risk management.

Do not implement now.

Only prepare architecture.

---

# FINAL CURSOR INSTRUCTION

Before writing code:

1. Analyze existing architecture.
2. Explain implementation plan.
3. Create files step-by-step.
4. Do not skip database design.
5. Do not create temporary solutions.
6. Keep modules independent.
7. Write production-quality code.
8. Document every major component.

The final application must be a professional trading research platform.