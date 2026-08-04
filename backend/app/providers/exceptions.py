"""Shared provider exceptions."""


class ProviderError(Exception):
    """Base error for market data providers."""


class ProviderAuthError(ProviderError):
    """Authentication / token failure."""


class ProviderNotConfiguredError(ProviderError):
    """Required credentials or base URL missing."""


class ProviderRateLimitError(ProviderError):
    """Upstream rate limit hit."""
