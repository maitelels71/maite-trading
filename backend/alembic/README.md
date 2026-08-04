# Database migrations (Alembic)

## Commands

From `backend/`:

```powershell
# Apply migrations
.\.venv\Scripts\python -m alembic upgrade head

# Or via helper
.\.venv\Scripts\python -m scripts.db_cli migrate-and-seed
```

## Notes

- Models live in `app/models/`.
- `candles` unique key: `(instrument_id, timeframe, timestamp)`.
- Timescale `create_hypertable` runs only if the `timescaledb` extension exists (no-op on AWS RDS PostgreSQL).
- Seed inserts MVP instruments (Schwab equities/ETFs + TradeAdvocate futures) and ORB strategy.
