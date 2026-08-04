"""Provider exceptions."""


class ProviderError(Exception):
    """Base provider error."""


class ProviderAuthError(ProviderError):
    """Authentication / authorization failure."""


class ProviderRateLimitError(ProviderError):
    """Rate limited by upstream provider."""


class ProviderNotFoundError(ProviderError):
    """Requested symbol or resource not found."""


class ProviderResponseError(ProviderError):
    """Unexpected or invalid provider response."""
