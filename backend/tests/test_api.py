from copy import deepcopy
from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app import ai
from app.database import EventRecord
from app.planning import today

MESSAGE = 'We now have 250 guests instead of 200, our budget is ₹7 lakh instead of ₹8 lakh, and the event is two weeks earlier. Keep food quality as the top priority.'


def proposal(client, event_id, message=MESSAGE, request_id=None):
    response = client.post(f'/api/events/{event_id}/proposals', json={'message': message, 'request_id': request_id or str(uuid4())})
    assert response.status_code == 200, response.text
    result = response.json()
    assert 'id' in result, result
    return result


def test_complete_planning_journey(client, event):
    event_id = event['id']
    path = f'/api/events/{event_id}'
    food = event['budget_items'][0]
    response = client.patch(f'{path}/budget/{food["id"]}', json={'committed_paise': 20_000_000, 'actual_paise': 2_000_000, 'quote_guest_count': 200, 'expected_version': event['version']})
    assert response.status_code == 200, response.text
    edited = response.json()
    assert edited['budget_items'][0]['source'] == 'user'
    assert edited['budget_items'][0]['projected_paise'] == 20_000_000
    first_task = event['tasks'][0]
    response = client.patch(f'{path}/tasks/{first_task["id"]}', json={'status': 'done'})
    assert response.status_code == 200, response.text
    assert response.json()['summary']['completed_tasks'] == 1
    assert response.json()['tasks'][1]['readiness'] == 'ready'
    vendor_ids = []
    for name, quote in [('Family Kitchen', 21_000_000), ('Celebration Caterers', 22_500_000)]:
        response = client.post(f'{path}/vendors', json=dict(name=name, category='food', quoted_paise=quote,
            guests_covered=200, inclusions='Vegetarian buffet and service', exclusions='Transport',
            taxes_paise=1_000_000, additional_charges_paise=200_000,
            payment_terms='25% deposit', availability='unknown'))
        assert response.status_code == 201, response.text
        vendor_ids.append(response.json()['vendors'][-1]['id'])
    comparison = client.post(f'{path}/vendors/compare', json={'vendor_ids': vendor_ids})
    assert comparison.status_code == 200, comparison.text
    assert comparison.json()['ai_mode'] == 'demo'
    assert comparison.json()['questions']
    before = client.get(path).json()
    preview = proposal(client, event_id)
    assert preview['changes']['guest_count'] == 250
    assert preview['changes']['budget_paise'] == 70_000_000
    assert preview['after']['event_date'] == (today() + timedelta(days=106)).isoformat()
    assert preview['after']['budget_items'][0]['committed_paise'] == 20_000_000
    assert preview['after']['budget_items'][0]['actual_paise'] == 2_000_000
    fixed_ids = {row['id'] for row in before['budget_items'] if row['cost_type'] == 'fixed'}
    for row in preview['after']['budget_items']:
        if row['id'] in fixed_ids:
            old = next(item for item in before['budget_items'] if item['id'] == row['id'])
            assert row['projected_paise'] == old['projected_paise']
    assert len(preview['task_impacts']) == before['summary']['total_tasks'] - 1
    assert client.get(path).json() == before
    discarded = client.post(f'{path}/proposals/{preview["id"]}/discard')
    assert discarded.json() == {'status': 'discarded'}
    assert client.get(path).json() == before
    assert client.post(f'{path}/proposals/{preview["id"]}/apply').status_code == 409
    preview = proposal(client, event_id)
    applied = client.post(f'{path}/proposals/{preview["id"]}/apply')
    assert applied.status_code == 200, applied.text
    after = applied.json()
    assert after['guest_count'] == 250
    assert after['version'] == before['version'] + 1
    assert client.get(path).json() == after
    assert client.post(f'{path}/proposals/{preview["id"]}/apply').json() == after
    history = client.get(f'{path}/revisions').json()
    previous = next(revision for revision in history if revision['label'].startswith('Before applying change:'))
    restored = client.post(f'{path}/revisions/{previous["id"]}/restore', json={'expected_version': after['version']})
    assert restored.status_code == 200, restored.text
    expected = deepcopy(before)
    expected['version'] = after['version'] + 1
    assert restored.json() == expected
    assert len(client.get(f'{path}/revisions').json()) == len(history) + 1


def test_stale_proposals_and_expected_version(client, event):
    preview = proposal(client, event['id'])
    path = f'/api/events/{event["id"]}'
    changed = client.patch(f'{path}/tasks/{event["tasks"][0]["id"]}', json={'status': 'done', 'expected_version': event['version']})
    assert changed.status_code == 200
    assert client.post(f'{path}/proposals/{preview["id"]}/apply').status_code == 409
    response = client.patch(f'{path}/budget/{event["budget_items"][0]["id"]}', json={'estimate_paise': 1, 'expected_version': event['version']})
    assert response.status_code == 409
    revision_id = client.get(f'{path}/revisions').json()[0]['id']
    assert client.post(f'{path}/revisions/{revision_id}/restore', json={'expected_version': event['version']}).status_code == 409
    assert client.get(path).json() == changed.json()


def test_idempotent_proposal_requests(client, event):
    request_id = str(uuid4())
    first = proposal(client, event['id'], request_id=request_id)
    second = proposal(client, event['id'], request_id=request_id)
    assert first == second
    conflict = client.post(f'/api/events/{event["id"]}/proposals', json={'message': 'Make it 300 guests', 'request_id': request_id})
    assert conflict.status_code == 409


def test_owner_isolation_on_every_operation(client, app, event):
    path = f'/api/events/{event["id"]}'
    preview = proposal(client, event['id'])
    revision_id = client.get(f'{path}/revisions').json()[0]['id']
    with TestClient(app) as other:
        assert other.get('/api/events').json() == []
        attempts = [
            ('get', path, None), ('get', f'{path}/revisions', None),
            ('patch', f'{path}/budget/{event["budget_items"][0]["id"]}', {'estimate_paise': 10}),
            ('post', f'{path}/budget', {'category': 'other', 'label': 'Test', 'cost_type': 'fixed', 'estimate_paise': 1}),
            ('patch', f'{path}/tasks/{event["tasks"][0]["id"]}', {'status': 'done'}),
            ('post', f'{path}/tasks', {'title': 'Test', 'due_date': today().isoformat()}),
            ('post', f'{path}/vendors', {'name': 'Unknown', 'category': 'food', 'quoted_paise': 1}),
            ('patch', f'{path}/vendors/unknown', {'availability': 'available'}),
            ('post', f'{path}/vendors/compare', {'vendor_ids': ['first', 'second']}),
            ('post', f'{path}/proposals', {'message': MESSAGE, 'request_id': str(uuid4())}),
            ('post', f'{path}/proposals/{preview["id"]}/apply', None),
            ('post', f'{path}/proposals/{preview["id"]}/discard', None),
            ('post', f'{path}/revisions/{revision_id}/restore', {'expected_version': event['version']}),
            ('delete', path, None),
        ]
        for method, url, body in attempts:
            response = other.request(method, url, json=body)
            assert response.status_code == 404, (method, url, response.text)


def test_cookie_is_http_only_strict_and_hashed_in_database(client, app, event):
    fresh = TestClient(app)
    response = fresh.get('/api/events')
    cookie = response.headers['set-cookie'].lower()
    assert 'httponly' in cookie
    assert 'samesite=strict' in cookie
    with app.state.db.sessions() as db:
        record = db.scalar(select(EventRecord).where(EventRecord.id == event['id']))
        assert len(record.owner_hash) == 64
        assert record.owner_hash != client.cookies.get('gatherly_session')


def test_dependency_api_rejects_cycles_and_foreign_records(client, event):
    path = f'/api/events/{event["id"]}/tasks'
    first, second = event['tasks'][:2]
    response = client.patch(f'{path}/{first["id"]}', json={'dependencies': [second['id']]})
    assert response.status_code == 422
    response = client.patch(f'{path}/{first["id"]}', json={'dependencies': ['foreign-id']})
    assert response.status_code == 422
    assert client.delete(f'{path}/{first["id"]}').status_code == 422


def test_ai_failure_preserves_plan(client, event, monkeypatch):
    async def fail(*_args):
        raise ai.AIError('AI is unavailable; retry shortly.')
    monkeypatch.setattr(ai, 'explain_revision', fail)
    path = f'/api/events/{event["id"]}'
    response = client.post(f'{path}/proposals', json={'message': MESSAGE, 'request_id': str(uuid4())})
    assert response.status_code == 503
    assert client.get(path).json() == event
    assert len(client.get(f'{path}/revisions').json()) == 1


def test_ai_extraction_cannot_write_unsupported_fields(client, event, monkeypatch):
    async def bad(*_args):
        return {'changes': {'guest_count': 250, 'non_negotiables': []}, 'clarification': None}
    monkeypatch.setattr(ai, 'extract_changes', bad)
    response = client.post(f'/api/events/{event["id"]}/proposals', json={'message': MESSAGE, 'request_id': str(uuid4())})
    assert response.status_code == 422
    assert client.get(f'/api/events/{event["id"]}').json() == event


def test_priority_categories_and_past_dates_are_validated(client, event, monkeypatch):
    for changes in [{'priorities': ['arbitrary-model-field']}, {'event_date': '2020-01-01'}, {'budget_paise': -1}, {'guest_count': 0}]:
        async def extract(*_args):
            return {'changes': changes, 'clarification': None}
        monkeypatch.setattr(ai, 'extract_changes', extract)
        response = client.post(f'/api/events/{event["id"]}/proposals', json={'message': MESSAGE, 'request_id': str(uuid4())})
        assert response.status_code == 422, response.text


def test_body_size_origin_rate_limit_and_strict_money(client, event_input, monkeypatch):
    assert client.post('/api/events', content='x' * (128 * 1024 + 1), headers={'Content-Type': 'application/json'}).status_code == 413
    assert client.get('/api/events', headers={'Origin': 'https://evil.example'}).status_code == 403
    assert client.post('/api/events', json=event_input, headers={'Sec-Fetch-Site': 'cross-site'}).status_code == 403
    event_input['budget_paise'] = 123.5
    assert client.post('/api/events', json=event_input).status_code == 422
    monkeypatch.setenv('DISABLE_RATE_LIMIT', 'false')
    # Invalid past dates still spend the AI endpoint rate budget.
    event_input.update(budget_paise=80_000_000, event_date='2020-01-01')
    statuses = [client.post('/api/events', json=event_input).status_code for _ in range(13)]
    assert statuses[-1] == 429


def test_sample_is_four_calendar_months_from_creation(client):
    response = client.post('/api/events/sample')
    assert response.status_code == 201, response.text
    sample = response.json()
    assert sample['budget_paise'] == 80_000_000
    assert sample['guest_count'] == 200
    assert sample['summary']['days_remaining'] in range(120, 124)
    assert 'Accessible venue' in sample['non_negotiables']
    assert sample['vendors'] == []


def test_unsafe_large_projection_rejected_without_mutation(client, event, monkeypatch):
    path = f'/api/events/{event["id"]}'
    row = event['budget_items'][0]
    changed = client.patch(f'{path}/budget/{row["id"]}', json={'estimate_paise': 100_000_000_000})
    assert changed.status_code == 200
    before = changed.json()

    async def extract(*_args):
        return {'changes': {'guest_count': 100_000}, 'clarification': None}
    monkeypatch.setattr(ai, 'extract_changes', extract)
    response = client.post(f'{path}/proposals', json={'message': 'Increase guests to 100000', 'request_id': str(uuid4())})
    assert response.status_code == 422
    assert 'monetary range' in response.json()['detail']
    assert client.get(path).json() == before


def test_extreme_task_date_shift_returns_validation_error(client, event):
    path = f'/api/events/{event["id"]}'
    response = client.post(f'{path}/tasks', json={'title': 'Old deadline', 'due_date': '0001-01-01'})
    assert response.status_code == 201
    before = response.json()
    response = client.post(f'{path}/proposals', json={'message': 'Move the event two weeks earlier', 'request_id': str(uuid4())})
    assert response.status_code == 422
    assert 'supported calendar' in response.json()['detail']
    assert client.get(path).json() == before


def test_concurrent_mutations_only_one_version_wins(client, event):
    from concurrent.futures import ThreadPoolExecutor
    path = f'/api/events/{event["id"]}'
    def write(status):
        return client.patch(f'{path}/tasks/{event["tasks"][0]["id"]}', json={'status': status, 'expected_version': event['version']})
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(write, ['done', 'in_progress']))
    assert sorted(response.status_code for response in responses) == [200, 409]
    assert client.get(path).json()['version'] == event['version'] + 1
    assert len(client.get(f'{path}/revisions').json()) == 2


def test_persistence_survives_new_app_instance(client, app, event, monkeypatch):
    from app.main import create_app
    token = client.cookies.get('gatherly_session')
    same_db = create_app(str(app.state.db.engine.url))
    with TestClient(same_db) as restarted:
        restarted.cookies.set('gatherly_session', token)
        assert restarted.get(f'/api/events/{event["id"]}').json() == event


def test_input_priorities_use_known_categories(client, event_input):
    event_input['priorities'] = ['food', 'guest comfort', 'decoration']
    response = client.post('/api/events', json=event_input)
    assert response.status_code == 201
    assert response.json()['priorities'] == ['food', 'logistics', 'decor']
    event_input['priorities'] = ['not-a-category']
    assert client.post('/api/events', json=event_input).status_code == 422


def test_vendor_total_is_server_derived_and_rejects_client_totals(client, event):
    path = f'/api/events/{event["id"]}/vendors'
    payload = dict(name='All-in Caterer', category='food', quoted_paise=20_000_000,
                   taxes_paise=1_000_000, additional_charges_paise=500_000)
    response = client.post(path, json=payload)
    assert response.status_code == 201, response.text
    vendor = response.json()['vendors'][-1]
    assert vendor['total_paise'] == 21_500_000
    response = client.patch(f'{path}/{vendor["id"]}', json={'additional_charges_paise': 0})
    assert response.status_code == 200
    assert response.json()['vendors'][-1]['total_paise'] == 21_000_000
    payload['total_paise'] = 1
    assert client.post(path, json=payload).status_code == 422


def test_revision_timestamps_include_utc_offset_for_local_display(client, app, event):
    from datetime import datetime, timezone
    from zoneinfo import ZoneInfo
    from app.database import RevisionRecord

    # SQLite returns naive datetimes even from a timezone-aware column. The API
    # must identify this stored UTC value before the browser converts it locally.
    fixed_utc = datetime(2026, 11, 1, 18, 45, 0, tzinfo=timezone.utc)
    with app.state.db.sessions() as db:
        revision = db.scalar(select(RevisionRecord).where(RevisionRecord.event_id == event['id']))
        revision.created_at = fixed_utc
        db.commit()
    history = client.get(f'/api/events/{event["id"]}/revisions').json()
    timestamp = history[0]['created_at']
    assert timestamp == '2026-11-01T18:45:00+00:00'
    local = datetime.fromisoformat(timestamp).astimezone(ZoneInfo('Asia/Kolkata'))
    assert local.isoformat() == '2026-11-02T00:15:00+05:30'


def test_health_does_not_issue_or_replace_event_session(client):
    response = client.get('/api/health')
    assert 'set-cookie' not in response.headers
    assert 'gatherly_session' not in client.cookies
    client.get('/api/events')
    token = client.cookies.get('gatherly_session')
    assert token
    assert 'set-cookie' not in client.get('/api/health').headers
    assert client.cookies.get('gatherly_session') == token


def test_no_op_edits_do_not_create_snapshots(client, event):
    path = f'/api/events/{event["id"]}'
    for _ in range(3):
        response = client.patch(f'{path}/tasks/{event["tasks"][0]["id"]}', json={})
        assert response.status_code == 200
        assert response.json()['version'] == event['version']
    assert len(client.get(f'{path}/revisions').json()) == 1


def test_regular_writes_are_rate_limited(client, event, monkeypatch):
    monkeypatch.setenv('DISABLE_RATE_LIMIT', 'false')
    path = f'/api/events/{event["id"]}/tasks/{event["tasks"][0]["id"]}'
    for _ in range(60):
        assert client.patch(path, json={}).status_code == 200
    response = client.patch(path, json={})
    assert response.status_code == 429
    assert int(response.headers['retry-after']) > 0
    assert response.headers['x-content-type-options'] == 'nosniff'


def test_no_database_connection_held_during_ai(client, app, event, event_input, monkeypatch):
    calls = []
    for name in ['generate_plan', 'extract_changes', 'explain_revision', 'compare_vendors']:
        original = getattr(ai, name)
        async def checked(*args, original=original, name=name):
            calls.append(name)
            assert app.state.db.engine.pool.checkedout() == 0
            return await original(*args)
        monkeypatch.setattr(ai, name, checked)
    assert client.post('/api/events', json=event_input).status_code == 201
    proposal(client, event['id'])
    path = f'/api/events/{event["id"]}/vendors'
    ids = []
    for name in ['A', 'B']:
        response = client.post(path, json={'name': name, 'category': 'food', 'quoted_paise': 10000})
        ids.append(response.json()['vendors'][-1]['id'])
    assert client.post(path + '/compare', json={'vendor_ids': ids}).status_code == 200
    assert set(calls) == {'generate_plan', 'extract_changes', 'explain_revision', 'compare_vendors'}


def test_event_deleted_during_ai_cannot_leave_orphan_proposal(client, app, event, monkeypatch):
    from sqlalchemy import func
    from app.database import ProposalRecord, RevisionRecord
    original = ai.explain_revision
    async def deleted(*args):
        with TestClient(app) as other:
            other.cookies.update(client.cookies)
            assert other.delete(f'/api/events/{event["id"]}').status_code == 204
        return await original(*args)
    monkeypatch.setattr(ai, 'explain_revision', deleted)
    response = client.post(f'/api/events/{event["id"]}/proposals', json={'message': MESSAGE, 'request_id': str(uuid4())})
    assert response.status_code == 404
    with app.state.db.sessions() as db:
        for model in [EventRecord, RevisionRecord, ProposalRecord]:
            assert db.scalar(select(func.count()).select_from(model)) == 0


def test_plan_changed_during_ai_rejects_outdated_preview(client, app, event, monkeypatch):
    original = ai.explain_revision
    async def changed(*args):
        with app.state.db.sessions() as db:
            record = db.get(EventRecord, event['id'])
            record.version += 1
            db.commit()
        return await original(*args)
    monkeypatch.setattr(ai, 'explain_revision', changed)
    response = client.post(f'/api/events/{event["id"]}/proposals', json={'message': MESSAGE, 'request_id': str(uuid4())})
    assert response.status_code == 409
    assert 'changed while' in response.json()['detail']


def test_history_reads_metadata_without_loading_snapshot_json(client, app, event):
    from sqlalchemy import event as sql_event
    statements = []
    def capture(_conn, _cursor, statement, *_args):
        statements.append(statement)
    sql_event.listen(app.state.db.engine, 'before_cursor_execute', capture)
    try:
        response = client.get(f'/api/events/{event["id"]}/revisions')
        assert response.status_code == 200
        assert len(response.json()) == 1
        assert all('revisions.data' not in statement and 'events.data' not in statement for statement in statements)
    finally:
        sql_event.remove(app.state.db.engine, 'before_cursor_execute', capture)


def test_production_headers_cache_policy_and_file_boundaries(tmp_path, monkeypatch):
    from app.main import create_app
    static = tmp_path / 'dist'
    (static / 'assets').mkdir(parents=True)
    (static / 'index.html').write_text('<html>Gatherly</html>')
    (static / 'assets/app-12345678.js').write_text('export const app = true;')
    (static / '.env').write_text('private fixture')
    monkeypatch.setenv('STATIC_DIR', str(static))
    monkeypatch.setenv('COOKIE_SECURE', 'true')
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    with TestClient(create_app('sqlite:///:memory:'), base_url='https://testserver') as browser:
        html = browser.get('/')
        assert "frame-ancestors 'none'" in html.headers['content-security-policy']
        assert "script-src 'self';" in html.headers['content-security-policy']
        assert html.headers['cache-control'] == 'no-cache'
        assert html.headers['strict-transport-security'] == 'max-age=31536000'
        assert 'set-cookie' not in html.headers
        asset = browser.get('/assets/app-12345678.js')
        assert asset.headers['cache-control'] == 'public, max-age=31536000, immutable'
        assert 'set-cookie' not in asset.headers
        assert browser.get('/assets/missing.js').status_code == 404
        assert browser.get('/.env').status_code == 404
        blocked = browser.post('/api/events', headers={'Origin': 'https://untrusted.example'})
        assert blocked.status_code == 403
        assert blocked.headers['cache-control'] == 'no-store'
        assert blocked.headers['x-frame-options'] == 'DENY'
        cookie = browser.get('/api/events').headers['set-cookie'].lower()
        assert 'secure' in cookie and 'httponly' in cookie
