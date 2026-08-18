"""HTTP helpers shared by provider adapters."""

from __future__ import annotations

import httpx

from app.providers.exceptions import ProviderError, ProviderRateLimitError


def raise_for_provider_response(response: httpx.Response, *, provider: str) -> None:
    if response.status_code == 429:
        raw = (response.headers.get("Retry-After") or "").strip()
        retry_after = float(raw) if raw.isdigit() else None
        snippet = " ".join((response.text or "").split())[:240]
        raise ProviderRateLimitError(
            f"{provider} 429 retry_after={int(retry_after) if retry_after else '?'} {snippet}".strip(),
            retry_after=retry_after,
            body=snippet,
        )
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise ProviderError(
            f"{provider} HTTP {response.status_code}: {response.text[:500]}"
        ) from exc
