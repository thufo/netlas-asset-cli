"""Small standard-library client for the official Netlas API."""

from __future__ import annotations

import json
import math
import time
from datetime import timezone
from email.utils import parsedate_to_datetime
from typing import Any, Callable, Dict, List
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from . import __version__


class NetlasError(RuntimeError):
    """Raised when the Netlas API cannot complete a request."""


class NetlasClient:
    """A minimal Netlas API client with no third-party dependencies."""

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = "https://app.netlas.io",
        timeout: float = 30.0,
        max_retries: int = 2,
        retry_backoff: float = 0.5,
        opener: Callable[..., Any] = urlopen,
        sleeper: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.time,
    ) -> None:
        if not api_key or not api_key.strip():
            raise ValueError("A Netlas API key is required")
        if max_retries < 0:
            raise ValueError("max_retries cannot be negative")
        if retry_backoff < 0:
            raise ValueError("retry_backoff cannot be negative")
        self.api_key = api_key.strip()
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self.retry_backoff = retry_backoff
        self._opener = opener
        self._sleeper = sleeper
        self._clock = clock

    def _retry_delay(self, error: HTTPError, attempt: int) -> float:
        """Return a bounded delay, preferring a valid Retry-After header."""

        retry_after = error.headers.get("Retry-After") if error.headers else None
        if retry_after is not None:
            try:
                delay = float(retry_after)
                if math.isfinite(delay):
                    return min(max(delay, 0.0), 60.0)
            except ValueError:
                try:
                    retry_at = parsedate_to_datetime(retry_after)
                    if retry_at.tzinfo is None:
                        retry_at = retry_at.replace(tzinfo=timezone.utc)
                    delay = retry_at.timestamp() - self._clock()
                    if math.isfinite(delay):
                        return min(max(delay, 0.0), 60.0)
                except (TypeError, ValueError, OverflowError):
                    pass
        return min(self.retry_backoff * (2**attempt), 30.0)

    def _get(self, path: str, params: Dict[str, Any] | None = None) -> Any:
        query = urlencode(params or {}, doseq=True)
        url = f"{self.base_url}{path}"
        if query:
            url = f"{url}?{query}"

        request = Request(
            url,
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {self.api_key}",
                "User-Agent": f"netlas-asset-cli/{__version__}",
            },
            method="GET",
        )

        attempt = 0
        while True:
            try:
                with self._opener(request, timeout=self.timeout) as response:
                    raw = response.read()
                break
            except HTTPError as exc:
                retryable = exc.code == 429 or 500 <= exc.code <= 599
                if retryable and attempt < self.max_retries:
                    self._sleeper(self._retry_delay(exc, attempt))
                    attempt += 1
                    continue

                detail = ""
                try:
                    detail = exc.read().decode("utf-8", errors="replace").strip()
                except Exception:
                    pass
                suffix = f": {detail[:300]}" if detail else ""
                raise NetlasError(f"Netlas returned HTTP {exc.code}{suffix}") from exc
            except URLError as exc:
                raise NetlasError(f"Could not reach Netlas: {exc.reason}") from exc
            except TimeoutError as exc:
                raise NetlasError("The Netlas request timed out") from exc

        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise NetlasError("Netlas returned an invalid JSON response") from exc

    def host_summary(self, target: str) -> Dict[str, Any]:
        """Return public, aggregated information for an IP address or domain."""

        safe_target = quote(target, safe="")
        data = self._get(
            f"/api/host/{safe_target}/",
            {"public_indices_only": "true"},
        )
        if not isinstance(data, dict):
            raise NetlasError("Unexpected host response type")
        return data

    def search_responses(self, query: str, *, limit: int = 20) -> List[Dict[str, Any]]:
        """Search public response data and return up to ``limit`` documents."""

        if not query.strip():
            raise ValueError("A search query is required")
        if not 1 <= limit <= 200:
            raise ValueError("limit must be between 1 and 200")

        results: List[Dict[str, Any]] = []
        start = 0
        while len(results) < limit:
            payload = self._get(
                "/api/responses/",
                {
                    "q": query,
                    "start": start,
                    "source_type": "include",
                },
            )
            if not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
                raise NetlasError("Unexpected search response type")

            items = payload["items"]
            if not items:
                break

            for item in items:
                if isinstance(item, dict) and isinstance(item.get("data"), dict):
                    results.append(item["data"])
                    if len(results) >= limit:
                        break

            start += len(items)
            if len(items) < 20:
                break

        return results
