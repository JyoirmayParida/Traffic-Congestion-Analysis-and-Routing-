"""
cache.py — In-memory route result cache with TTL.

Provides a 30-second TTL cache for RouteResponse objects,
keyed by (source_id, dest_id, city). No external dependencies.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Optional

from models import RouteResponse

logger = logging.getLogger("cache")


@dataclass
class _CacheEntry:
    value: RouteResponse
    expires_at: float  # monotonic seconds


class RouteCache:
    """Thread-safe in-memory cache with TTL expiry."""

    def __init__(self) -> None:
        self._store: dict[str, _CacheEntry] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get(self, key: str) -> Optional[RouteResponse]:
        """Return cached RouteResponse if it exists and has not expired."""
        entry = self._store.get(key)
        if entry is None:
            return None
        if time.monotonic() > entry.expires_at:
            # Lazily evict expired entry
            del self._store[key]
            logger.debug(f"Cache EXPIRED: {key}")
            return None
        logger.debug(f"Cache HIT: {key}")
        return entry.value

    def set(self, key: str, result: RouteResponse, ttl_sec: int = 30) -> None:
        """Store a RouteResponse with the given TTL."""
        self._store[key] = _CacheEntry(
            value=result,
            expires_at=time.monotonic() + ttl_sec,
        )
        logger.debug(f"Cache SET: {key} (TTL={ttl_sec}s)")

    @staticmethod
    def make_key(source_id: str, dest_id: str, city: str) -> str:
        """Compose a deterministic cache key."""
        return f"route:{source_id}:{dest_id}:{city}"

    def invalidate_city(self, city: str) -> int:
        """
        Remove all cached entries whose key contains the city string.
        Called by the scheduler after traffic data is refreshed.
        Returns the number of entries invalidated.
        """
        stale_keys = [k for k in self._store if city in k]
        for key in stale_keys:
            del self._store[key]
        if stale_keys:
            logger.info(f"Cache invalidated {len(stale_keys)} entries for city='{city}'")
        return len(stale_keys)

    def size(self) -> int:
        """Return the number of live (non-expired) entries."""
        now = time.monotonic()
        return sum(1 for e in self._store.values() if e.expires_at > now)

    def clear(self) -> None:
        """Wipe the entire cache."""
        self._store.clear()


# ---------------------------------------------------------------------------
# Module-level singleton used by main.py and scheduler.py
# ---------------------------------------------------------------------------
route_cache = RouteCache()
