"""HTTP helpers for market-data providers."""

from __future__ import annotations

from typing import Any, Mapping, MutableMapping, Optional

import httpx

from app.providers.exceptions import (
    ProviderAuthError,
    ProviderError,
    ProviderNotFoundError,
    ProviderRateLimitError,
    ProviderResponseError,
)


def build_client(
    base_url: str,
    headers: Optional[Mapping[str, str]] = None,
    timeout: float = 30.0,
) -> httpx.Client:
    return httpx.Client(base_url=base_url, headers=dict(headers or {}), timeout=timeout)


def raise_for_status(response: httpx.Response, provider: str) -> None:
    if response.status_code in {401, 403}:
        raise ProviderAuthError(f"{provider} auth failed: {response.status_code}")
    if response.status_code == 404:
        raise ProviderNotFoundError(f"{provider} resource not found")
    if response.status_code == 429:
        raise ProviderRateLimitError(f"{provider} rate limited")
    if response.status_code >= 400:
        raise ProviderResponseError(
            f"{provider} HTTP {response.status_code}: {response.text[:300]}"
        )


def get_json(
    client: httpx.Client,
    path: str,
    *,
    params: Optional[Mapping[str, Any]] = None,
    headers: Optional[MutableMapping[str, str]] = None,
    provider: str = "provider",
) -> Any:
    try:
        response = client.get(path, params=params, headers=headers)
    except httpx.HTTPError as exc:
        raise ProviderError(f"{provider} request failed: {exc}") from exc
    raise_for_status(response, provider)
    try:
        return response.json()
    except ValueError as exc:
        raise ProviderResponseError(f"{provider} returned non-JSON body") from exc
