"""Shared provider exceptions."""


class ProviderError(Exception):
    """Base error for market data providers."""


class ProviderAuthError(ProviderError):
    """Authentication / token failure."""


class ProviderNotConfiguredError(ProviderError):
    """Required credentials or base URL missing."""


class ProviderRateLimitError(ProviderError):
    """Upstream rate limit hit."""

    def __init__(
        self,
        message: str = "rate limit exceeded",
        *,
        retry_after: float | None = None,
        body: str = "",
    ) -> None:
        super().__init__(message)
        self.retry_after = retry_after
        self.body = body
