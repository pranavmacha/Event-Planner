from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.security import RateLimiter


def request(owner='owner', ip='127.0.0.1'):
    return Request({'type': 'http', 'client': (ip, 1234), 'state': {'owner_hash': owner}})


@pytest.fixture(autouse=True)
def enabled(monkeypatch):
    monkeypatch.setenv('DISABLE_RATE_LIMIT', 'false')


def test_new_sessions_cannot_bypass_ip_limit_or_allocate_unlimited_windows():
    limiter = RateLimiter()
    for i in range(30):
        limiter.check(request(str(i)))
    count = len(limiter.windows)
    for i in range(100):
        with pytest.raises(HTTPException) as error:
            limiter.check(request('rejected-' + str(i)))
        assert error.value.status_code == 429
    assert len(limiter.windows) == count


def test_capacity_fails_closed_and_recovers_after_expiry(monkeypatch):
    clock = [100.0]
    monkeypatch.setattr('app.security.time.monotonic', lambda: clock[0])
    limiter = RateLimiter(max_keys=3)
    limiter.check(request())
    with pytest.raises(HTTPException) as error:
        limiter.check(request('second', '192.0.2.1'))
    assert error.value.status_code == 503
    assert len(limiter.windows) == 3
    clock[0] += 3601
    limiter.check(request('second', '192.0.2.1'))
    assert len(limiter.windows) == 3


def test_limits_are_atomic_under_concurrent_requests():
    limiter = RateLimiter()
    def attempt(_):
        try:
            limiter.check(request())
            return 200
        except HTTPException as exc:
            return exc.status_code
    with ThreadPoolExecutor(max_workers=8) as pool:
        outcomes = list(pool.map(attempt, range(40)))
    assert outcomes.count(200) == 12
    assert outcomes.count(429) == 28


def test_hour_limit_returns_correct_retry_delay(monkeypatch):
    clock = [100.0]
    monkeypatch.setattr('app.security.time.monotonic', lambda: clock[0])
    limiter = RateLimiter()
    for _ in range(10):
        for _ in range(12):
            limiter.check(request())
        clock[0] += 61
    with pytest.raises(HTTPException) as error:
        limiter.check(request())
    assert error.value.headers['Retry-After'] == '2990'
