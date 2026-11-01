"""Resource-boundary regressions without live model calls or timing benchmarks."""
from concurrent.futures import ThreadPoolExecutor
import json
from threading import Event, Lock

import anyio
from fastapi import HTTPException
from fastapi.testclient import TestClient
import httpx
import pytest
from sqlalchemy import event as sql_event

from app.main import create_app


def test_workspace_summaries_do_not_enrich_or_load_full_json(client, app, event, monkeypatch):
    def unexpected_enrichment(*_args):
        raise AssertionError('The event switcher must not recalculate full plans')
    monkeypatch.setattr('app.main.enrich_event', unexpected_enrichment)
    statements = []
    def capture(_connection, _cursor, statement, *_args):
        statements.append(statement)
    sql_event.listen(app.state.db.engine, 'before_cursor_execute', capture)
    try:
        response = client.get('/api/events?summary=true')
    finally:
        sql_event.remove(app.state.db.engine, 'before_cursor_execute', capture)
    fields = ('id', 'version', 'name', 'occasion', 'city', 'event_date')
    assert response.json() == [{field: event[field] for field in fields}]
    assert any('JSON_EXTRACT' in statement for statement in statements)
    assert all(', events.data,' not in statement for statement in statements)
    with TestClient(app) as other:
        assert other.get('/api/events?summary=true').json() == []


@pytest.mark.parametrize('operation', ['create', 'sample', 'compare', 'propose'])
def test_database_wait_does_not_block_unrelated_requests(client, app, event, event_input, operation):
    """A blocked SQL query must leave the server loop free to answer health checks."""
    path = f'/api/events/{event["id"]}'
    vendors = []
    if operation == 'compare':
        for name in ['A', 'B']:
            response = client.post(path + '/vendors', json={
                'name': name, 'category': 'food', 'quoted_paise': 1000,
            })
            vendors.append(response.json()['vendors'][-1]['id'])
    requests = {
        'create': ('/api/events', event_input, 201),
        'sample': ('/api/events/sample', None, 201),
        'compare': (path + '/vendors/compare', {'vendor_ids': vendors}, 200),
        'propose': (path + '/proposals', {'message': 'Increase to 250 guests', 'request_id': 'resource-test'}, 200),
    }
    url, payload, expected = requests[operation]
    blocked, release = Event(), Event()
    lock = Lock()
    def hold_first_query(_connection, _cursor, _statement, *_args):
        with lock:
            if blocked.is_set():
                return
            blocked.set()
        assert release.wait(5), 'Test did not release the database query'
    sql_event.listen(app.state.db.engine, 'before_cursor_execute', hold_first_query)
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            pending = pool.submit(client.post, url, json=payload)
            try:
                assert blocked.wait(2)
                probe = pool.submit(client.get, '/api/health')
                assert probe.result(timeout=2).status_code == 200
            finally:
                release.set()
            assert pending.result(timeout=3).status_code == expected
    finally:
        sql_event.remove(app.state.db.engine, 'before_cursor_execute', hold_first_query)


@pytest.mark.parametrize('content_type', ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', ''])
def test_non_json_bodies_rejected_without_mutation(client, event_input, content_type):
    response = client.post('/api/events', content=json.dumps(event_input), headers={'Content-Type': content_type})
    assert response.status_code == 415
    assert client.get('/api/events').json() == []


def test_json_media_type_with_charset_and_suffix(client, event_input):
    for content_type in ['application/json; charset=utf-8', 'application/vnd.gatherly+json']:
        response = client.post('/api/events', content=json.dumps(event_input), headers={'Content-Type': content_type})
        assert response.status_code == 201


def test_slow_chunked_upload_has_deadline(client, app, monkeypatch):
    monkeypatch.setattr('app.main.BODY_TIMEOUT_SECONDS', 0.01)
    async def scenario():
        async def upload():
            yield b'{'
            await anyio.sleep(1)
            yield b'}'
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url='http://testserver') as browser:
            response = await browser.post('/api/events', content=upload(), headers={'Content-Type': 'application/json'})
            assert response.status_code == 408
            assert response.headers['cache-control'] == 'no-store'
    anyio.run(scenario)
    assert client.get('/api/events').json() == []


def test_exhausted_write_limit_rejects_before_reading_upload(client, app, monkeypatch):
    def reject(_request):
        raise HTTPException(429, 'Limit reached', headers={'Retry-After': '60'})
    monkeypatch.setattr(app.state.limiter, 'check_write', reject)
    async def scenario():
        async def upload():
            raise AssertionError('An exhausted client upload must not be consumed')
            yield b'{}'
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url='http://testserver') as browser:
            response = await browser.post('/api/events', content=upload(), headers={'Content-Type': 'application/json'})
            assert response.status_code == 429
            assert response.headers['retry-after'] == '60'
    anyio.run(scenario)


def test_chunked_upload_cannot_bypass_byte_limit(client, app):
    async def scenario():
        async def upload():
            for _ in range(3):
                yield b'x' * (64 * 1024)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url='http://testserver') as browser:
            response = await browser.post('/api/events', content=upload(), headers={'Content-Type': 'application/json'})
            assert response.status_code == 413
    anyio.run(scenario)


def test_read_limit_leaves_health_checks_available(client, app, event, monkeypatch):
    from collections import deque
    import time
    monkeypatch.setenv('DISABLE_RATE_LIMIT', 'false')
    owner_key = None
    client.get('/api/events?summary=true')
    for key in app.state.limiter.windows:
        if key.startswith('read:owner:'):
            owner_key = key
    assert owner_key is not None
    app.state.limiter.windows[owner_key] = deque([time.monotonic()] * 240)
    response = client.get(f'/api/events/{event["id"]}')
    assert response.status_code == 429
    assert int(response.headers['retry-after']) > 0
    assert client.get('/api/health').status_code == 200


def test_render_forces_secure_cookies_and_disables_documentation(tmp_path, monkeypatch):
    monkeypatch.setenv('RENDER', 'true')
    monkeypatch.setenv('COOKIE_SECURE', 'false')
    application = create_app('sqlite:///' + str(tmp_path / 'render.db'))
    assert application.openapi_url is None
    assert not any(route.path in ['/docs', '/redoc', '/openapi.json'] for route in application.routes)
    with TestClient(application, base_url='https://testserver') as browser:
        response = browser.get('/api/events?summary=true')
        assert 'secure' in response.headers['set-cookie'].lower()
        assert response.headers['strict-transport-security'] == 'max-age=31536000'
