# Alembic

Migrations live in `versions/`.

```bash
export DATABASE_URL=postgresql+psycopg2://user:pass@host:5432/maite
alembic upgrade head
```

The initial migration creates instruments, candles, strategies, backtest_runs, trades, and signals.
Candles have a unique constraint on `(instrument_id, timeframe, timestamp)`.
If the TimescaleDB extension is installed, candles are converted to a hypertable; otherwise the migration is a no-op for that step (RDS-safe).
