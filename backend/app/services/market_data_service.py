"""Candle validation and MarketDataService persistence."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Select, and_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.domain.candles import Candle as DomainCandle
from app.domain.enums import DataProviderName, MarketType
from app.domain.instruments import InstrumentRef
from app.models import Candle as CandleModel
from app.models import Instrument
from app.ports.market_data import MarketDataProvider
from app.providers.exceptions import ProviderError
from app.providers.factory import ProviderFactory, get_provider_factory

logger = get_logger(__name__)


class CandleValidationError(ValueError):
    """Invalid OHLCV series."""


def validate_candles(candles: list[DomainCandle]) -> None:
    if not candles:
        return
    prev_ts: datetime | None = None
    for i, c in enumerate(candles):
        if c.open < 0 or c.high < 0 or c.low < 0 or c.close < 0:
            raise CandleValidationError(f"negative price at index {i}")
        if c.high < c.low:
            raise CandleValidationError(f"high < low at index {i}")
        if c.high < max(c.open, c.close) or c.low > min(c.open, c.close):
            # soft check: high should be >= open/close, low <= open/close
            raise CandleValidationError(f"OHLC inconsistent at index {i}")
        if prev_ts is not None and c.timestamp < prev_ts:
            raise CandleValidationError(
                f"timestamps not monotonic at index {i}: {c.timestamp} < {prev_ts}"
            )
        prev_ts = c.timestamp


class MarketDataService:
    """Orchestrates provider fetch + DB upsert/read."""

    def __init__(
        self,
        session: Session,
        provider_factory: ProviderFactory | None = None,
    ) -> None:
        self._session = session
        self._factory = provider_factory or get_provider_factory()

    def resolve_provider(
        self,
        *,
        market_type: MarketType | None = None,
        data_provider: DataProviderName | None = None,
    ) -> MarketDataProvider:
        if data_provider is not None:
            return self._factory.get(data_provider)
        if market_type is not None:
            return self._factory.for_market_type(market_type)
        raise ValueError("market_type or data_provider is required")

    def get_instrument(self, symbol: str, market_type: str | None = None) -> Instrument:
        stmt: Select[tuple[Instrument]] = select(Instrument).where(
            Instrument.symbol == symbol,
            Instrument.active.is_(True),
        )
        if market_type:
            stmt = stmt.where(Instrument.market_type == market_type)
        rows = list(self._session.scalars(stmt))
        if not rows:
            raise ProviderError(f"Instrument not found: {symbol}")
        if len(rows) > 1 and market_type is None:
            raise ProviderError(
                f"Ambiguous symbol {symbol}; pass market_type "
                f"(found {[r.market_type for r in rows]})"
            )
        return rows[0]

    def provider_for_instrument(self, instrument: Instrument | InstrumentRef) -> MarketDataProvider:
        provider_name = (
            instrument.data_provider
            if isinstance(instrument.data_provider, DataProviderName)
            else DataProviderName(instrument.data_provider)
        )
        return self._factory.get(provider_name)

    def save_candles(
        self,
        instrument_id: int,
        timeframe: str,
        candles: list[DomainCandle],
    ) -> int:
        validate_candles(candles)
        if not candles:
            return 0

        dialect = self._session.bind.dialect.name if self._session.bind is not None else ""
        if dialect == "postgresql":
            return self._upsert_postgres(instrument_id, timeframe, candles)
        return self._upsert_generic(instrument_id, timeframe, candles)

    def _upsert_postgres(
        self,
        instrument_id: int,
        timeframe: str,
        candles: list[DomainCandle],
    ) -> int:
        rows = [
            {
                "instrument_id": instrument_id,
                "timestamp": c.timestamp,
                "timeframe": timeframe,
                "open": c.open,
                "high": c.high,
                "low": c.low,
                "close": c.close,
                "volume": c.volume,
            }
            for c in candles
        ]
        stmt = pg_insert(CandleModel).values(rows)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_candles_instrument_tf_ts",
            set_={
                "open": stmt.excluded.open,
                "high": stmt.excluded.high,
                "low": stmt.excluded.low,
                "close": stmt.excluded.close,
                "volume": stmt.excluded.volume,
            },
        )
        result = self._session.execute(stmt)
        self._session.flush()
        return result.rowcount or len(rows)

    def _upsert_generic(
        self,
        instrument_id: int,
        timeframe: str,
        candles: list[DomainCandle],
    ) -> int:
        """SQLite-friendly upsert used in tests."""
        written = 0
        for c in candles:
            existing = self._session.scalar(
                select(CandleModel).where(
                    CandleModel.instrument_id == instrument_id,
                    CandleModel.timeframe == timeframe,
                    CandleModel.timestamp == c.timestamp,
                )
            )
            if existing:
                existing.open = c.open
                existing.high = c.high
                existing.low = c.low
                existing.close = c.close
                existing.volume = c.volume
            else:
                self._session.add(
                    CandleModel(
                        instrument_id=instrument_id,
                        timestamp=c.timestamp,
                        timeframe=timeframe,
                        open=c.open,
                        high=c.high,
                        low=c.low,
                        close=c.close,
                        volume=c.volume,
                    )
                )
            written += 1
        self._session.flush()
        return written

    def get_candles_by_range(
        self,
        instrument_id: int,
        timeframe: str,
        start: datetime,
        end: datetime,
    ) -> list[DomainCandle]:
        rows = self._session.scalars(
            select(CandleModel)
            .where(
                and_(
                    CandleModel.instrument_id == instrument_id,
                    CandleModel.timeframe == timeframe,
                    CandleModel.timestamp >= start,
                    CandleModel.timestamp <= end,
                )
            )
            .order_by(CandleModel.timestamp.asc())
        ).all()

        instrument = self._session.get(Instrument, instrument_id)
        ticker = instrument.symbol if instrument else ""
        return [
            DomainCandle(
                timestamp=r.timestamp,
                open=Decimal(r.open),
                high=Decimal(r.high),
                low=Decimal(r.low),
                close=Decimal(r.close),
                volume=Decimal(r.volume),
                ticker=ticker,
                timeframe=r.timeframe,
            )
            for r in rows
        ]

    def sync_historical_data(
        self,
        symbol: str,
        timeframe: str,
        start: datetime,
        end: datetime,
        *,
        market_type: str | None = None,
        force_refresh: bool = False,
    ) -> list[DomainCandle]:
        instrument = self.get_instrument(symbol, market_type=market_type)

        if not force_refresh:
            cached = self.get_candles_by_range(instrument.id, timeframe, start, end)
            if cached:
                logger.info(
                    "Using %s cached candles for %s %s",
                    len(cached),
                    symbol,
                    timeframe,
                )
                return cached

        provider = self.provider_for_instrument(instrument)
        logger.info(
            "Fetching %s %s via %s (%s → %s)",
            symbol,
            timeframe,
            provider.name,
            start.isoformat(),
            end.isoformat(),
        )
        candles = provider.get_historical_candles(symbol, timeframe, start, end)
        validate_candles(candles)
        self.save_candles(instrument.id, timeframe, candles)
        self._session.commit()
        return self.get_candles_by_range(instrument.id, timeframe, start, end)
