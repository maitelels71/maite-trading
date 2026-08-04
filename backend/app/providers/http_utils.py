"""HTTP helpers shared by provider adapters."""

from __future__ import annotations

import httpx

from app.providers.exceptions import ProviderError, ProviderRateLimitError


def raise_for_provider_response(response: httpx.Response, *, provider: str) -> None:
    if response.status_code == 429:
        raise ProviderRateLimitError(f"{provider} rate limit exceeded")
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise ProviderError(
            f"{provider} HTTP {response.status_code}: {response.text[:300]}"
        ) from exc
