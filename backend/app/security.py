"""Small, bounded abuse controls for the single-worker deployment."""
from collections import deque
import math
import os
from threading import Lock
import time

from fastapi import HTTPException, Request


class RateLimiter:
    """Sliding windows with a hard memory ceiling; never evict active limits."""

    def __init__(self, max_keys: int = 10_000):
        self.windows: dict[str, deque] = {}
        self.expires: dict[str, float] = {}
        self.max_keys = max_keys
        self.next_cleanup = 0.0
        self.lock = Lock()

    def _consume(self, rules: list[tuple[str, int, int]], message: str):
        if os.getenv('DISABLE_RATE_LIMIT', '').lower() == 'true':
            return
        with self.lock:
            now = time.monotonic()
            if now >= self.next_cleanup:
                for key in list(self.expires):
                    if self.expires[key] <= now:
                        del self.windows[key]
                        del self.expires[key]
                self.next_cleanup = now + 60
            for key, limit, period in rules:
                window = self.windows.get(key)
                if window is not None:
                    while window and window[0] <= now - period:
                        window.popleft()
                    if len(window) >= limit:
                        retry = max(1, math.ceil(window[0] + period - now))
                        raise HTTPException(429, message, headers={'Retry-After': str(retry)})
            missing = sum(key not in self.windows for key, _, _ in rules)
            if len(self.windows) + missing > self.max_keys:
                raise HTTPException(503, 'The server is busy. Please retry shortly.', headers={'Retry-After': '60'})
            for key, _, period in rules:
                self.windows.setdefault(key, deque()).append(now)
                self.expires[key] = now + period

    def check(self, request: Request):
        owner = request.state.owner_hash
        ip = request.client.host if request.client else 'unknown'
        self._consume([(f'ai:ip:{ip}', 30, 60), (f'ai:owner:{owner}', 12, 60),
                       (f'ai:hour:{owner}', 120, 3600)],
                      'Too many AI requests. Please wait and retry.')

    def check_write(self, request: Request):
        owner = request.state.owner_hash
        ip = request.client.host if request.client else 'unknown'
        self._consume([(f'write:ip:{ip}', 180, 60), (f'write:owner:{owner}', 60, 60)],
                      'Too many changes. Please wait and retry.')

    def check_read(self, request: Request):
        owner = request.state.owner_hash
        ip = request.client.host if request.client else 'unknown'
        self._consume([(f'read:ip:{ip}', 600, 60), (f'read:owner:{owner}', 240, 60)],
                      'Too many plan requests. Please wait and retry.')
