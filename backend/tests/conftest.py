from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.planning import today


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    monkeypatch.setenv('DISABLE_RATE_LIMIT', 'true')
    monkeypatch.setenv('COOKIE_SECURE', 'false')
    return create_app('sqlite:///' + str(tmp_path / 'test.db'))


@pytest.fixture
def client(app):
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def event_input():
    return dict(name='Family celebration', occasion='Wedding', city='Bengaluru',
                event_date=(today() + timedelta(days=120)).isoformat(),
                budget_paise=80_000_000, guest_count=200,
                atmosphere='Warm and joyful', theme='Marigold',
                priorities=['food', 'logistics', 'venue', 'decor'],
                non_negotiables=['Accessible venue', 'Food quality'],
                dietary_preferences='Vegetarian', accessibility_needs='Step-free access',
                cultural_preferences='Indian ceremony')


@pytest.fixture
def event(client, event_input):
    response = client.post('/api/events', json=event_input)
    assert response.status_code == 201, response.text
    return response.json()
