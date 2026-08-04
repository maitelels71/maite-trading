"""Market data service — validate, upsert, and cache candles."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional, Sequence

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.domain.candles import Candle, ensure_monotonic, sort_candles
from app.models.candle import CandleRow
from app.models.instrument import Instrument
from app.ports.market_data import MarketDataProvider
from app.providers.factory import ProviderFactory, get_provider_factory

logger = get_logger(__name__)


class MarketDataService:
    def __init__(
        self,
        session: Session,
        provider_factory: Optional[ProviderFactory] = None,
    ) -> None:
        self.session = session
        self.provider_factory = provider_factory or get_provider_factory()

    def get_instrument(self, symbol: str) -> Instrument:
        instrument = self.session.scalar(
            select(Instrument).where(Instrument.symbol == symbol.upper(), Instrument.is_active.is_(True))
        )
        if instrument is None:
            raise LookupError(f"instrument not found: {symbol}")
        return instrument

    def validate_candles(self, candles: Sequence[Candle]) -> List[Candle]:
        ordered = sort_candles(candles)
        if not ordered:
            return []
        ensure_monotonic(ordered)
        for candle in ordered:
            if candle.volume < 0:
                raise ValueError("volume must be >= 0")
            for field in (candle.open, candle.high, candle.low, candle.close):
                if field <= 0:
                    raise ValueError("prices must be > 0")
        return ordered

    def upsert_candles(self, instrument_id: int, candles: Sequence[Candle]) -> int:
        validated = self.validate_candles(candles)
        if not validated:
            return 0

        rows = [
            {
                "instrument_id": instrument_id,
                "timeframe": c.timeframe,
                "timestamp": c.timestamp,
                "open": c.open,
                "high": c.high,
                "low": c.low,
                "close": c.close,
                "volume": c.volume,
            }
            for c in validated
        ]

        bind = self.session.get_bind()
        dialect = bind.dialect.name if bind is not None else "sqlite"
        if dialect == "postgresql":
            stmt = pg_insert(CandleRow).values(rows)
            stmt = stmt.on_conflict_do_update(
                constraint="uq_candles_instrument_timeframe_timestamp",
                set_={
                    "open": stmt.excluded.open,
                    "high": stmt.excluded.high,
                    "low": stmt.excluded.low,
                    "close": stmt.excluded.close,
                    "volume": stmt.excluded.volume,
                },
            )
        else:
            stmt = sqlite_insert(CandleRow).values(rows)
            stmt = stmt.on_conflict_do_update(
                index_elements=["instrument_id", "timeframe", "timestamp"],
                set_={
                    "open": stmt.excluded.open,
                    "high": stmt.excluded.high,
                    "low": stmt.excluded.low,
                    "close": stmt.excluded.close,
                    "volume": stmt.excluded.volume,
                },
            )
        result = self.session.execute(stmt)
        self.session.flush()
        return result.rowcount if result.rowcount and result.rowcount > 0 else len(rows)

    def get_cached_candles(
        self,
        instrument_id: int,
        timeframe: str,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        symbol: str = "",
    ) -> List[Candle]:
        stmt = select(CandleRow).where(
            CandleRow.instrument_id == instrument_id,
            CandleRow.timeframe == timeframe,
        )
        if start is not None:
            stmt = stmt.where(CandleRow.timestamp >= start)
        if end is not None:
            stmt = stmt.where(CandleRow.timestamp <= end)
        stmt = stmt.order_by(CandleRow.timestamp.asc())
        rows = list(self.session.scalars(stmt))
        return [
            Candle(
                symbol=symbol,
                timestamp=r.timestamp,
                open=Decimal(r.open),
                high=Decimal(r.high),
                low=Decimal(r.low),
                close=Decimal(r.close),
                volume=Decimal(r.volume),
                timeframe=r.timeframe,
            )
            for r in rows
        ]

    def sync(
        self,
        symbol: str,
        timeframe: str,
        start: datetime,
        end: datetime,
        *,
        force_refresh: bool = False,
    ) -> dict:
        instrument = self.get_instrument(symbol)
        provider: MarketDataProvider = self.provider_factory.get(instrument.provider)

        cached = self.get_cached_candles(
            instrument.id,
            timeframe,
            start,
            end,
            symbol=instrument.symbol,
        )
        if cached and not force_refresh:
            logger.info("cache hit for %s %s (%s candles)", symbol, timeframe, len(cached))
            return {
                "symbol": instrument.symbol,
                "provider": instrument.provider,
                "timeframe": timeframe,
                "fetched": 0,
                "upserted": 0,
                "cached": len(cached),
                "source": "cache",
            }

        fetched = provider.get_candles(instrument.symbol, timeframe, start, end)
        upserted = self.upsert_candles(instrument.id, fetched)
        logger.info(
            "synced %s via %s: fetched=%s upserted=%s",
            instrument.symbol,
            provider.name,
            len(fetched),
            upserted,
        )
        return {
            "symbol": instrument.symbol,
            "provider": instrument.provider,
            "timeframe": timeframe,
            "fetched": len(fetched),
            "upserted": upserted,
            "cached": 0,
            "source": "provider",
        }
