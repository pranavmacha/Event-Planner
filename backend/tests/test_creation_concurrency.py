import asyncio
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import time
from uuid import uuid4

from sqlalchemy import event as sqlalchemy_event, func, select

from app import ai
from app.database import EventRecord, RevisionRecord


def test_concurrent_creations_cannot_exceed_browser_event_limit(client, app, event, event_input, monkeypatch):
    with app.state.db.sessions() as db:
        original = db.get(EventRecord, event['id'])
        for _ in range(28):
            data = deepcopy(original.data)
            data['id'] = str(uuid4())
            db.add(EventRecord(id=data['id'], owner_hash=original.owner_hash,
                               version=1, data=data))
        db.commit()

    generate = ai.generate_plan
    both_generating = asyncio.Event()
    calls = 0

    async def concurrent_generation(payload):
        nonlocal calls
        calls += 1
        if calls == 2:
            both_generating.set()
        # Both requests pass the first quota check before either AI call returns.
        await asyncio.wait_for(both_generating.wait(), timeout=5)
        return await generate(payload)

    monkeypatch.setattr(ai, 'generate_plan', concurrent_generation)

    def delayed_count(_connection, _cursor, statement, _parameters, _context, _executemany):
        if statement.startswith('SELECT count(') and both_generating.is_set():
            # Simulate a slow database result; without serialization both workers
            # observe 29 before either commits. A quota lock permits only one.
            time.sleep(0.05)

    sqlalchemy_event.listen(app.state.db.engine, 'after_cursor_execute', delayed_count)
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda _: client.post('/api/events', json=event_input), range(2)))
    finally:
        sqlalchemy_event.remove(app.state.db.engine, 'after_cursor_execute', delayed_count)

    assert sorted(response.status_code for response in responses) == [201, 422]
    assert '30-event limit' in next(response for response in responses if response.status_code == 422).json()['detail']
    with app.state.db.sessions() as db:
        assert db.scalar(select(func.count()).select_from(EventRecord)) == 30
        # The rejected request must not leave an event or original revision.
        assert db.scalar(select(func.count()).select_from(RevisionRecord)) == 2
