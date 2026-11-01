#!/usr/bin/env python3
"""Compare legacy full workspace reads with summaries plus one selected plan.

Run with backend/.venv/bin/python scripts/benchmark_workspace.py. Uses synthetic
plans in a temporary SQLite database; no saved user data or live AI is accessed.
Figures include TestClient/HTTP serialization, but exclude network latency and
browser rendering. Traced peaks are Python allocations, not total process RAM.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import json
import os
from pathlib import Path
import platform
import sys
from tempfile import TemporaryDirectory

from benchmark_planning import fixture, measure

os.environ['GEMINI_API_KEY'] = ''
os.environ['DATABASE_URL'] = 'sqlite:///:memory:'
os.environ['DISABLE_RATE_LIMIT'] = 'true'
os.environ['COOKIE_SECURE'] = 'false'
os.environ['RENDER'] = 'false'
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))

from fastapi.testclient import TestClient
from app.database import EventRecord
from app.main import create_app
from app.planning import enrich_event


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--events', type=int, default=30, choices=range(1, 31))
    parser.add_argument('--samples', type=int, default=5)
    parser.add_argument('--iterations', type=int, default=3)
    args = parser.parse_args()
    if args.samples < 1 or args.iterations < 1:
        parser.error('Samples and iterations must be positive.')
    with TemporaryDirectory(prefix='gatherly-workspace-benchmark-') as directory:
        app = create_app('sqlite:///' + str(Path(directory) / 'benchmark.db'))
        with TestClient(app) as browser:
            browser.get('/api/events?summary=true').raise_for_status()
            owner = hashlib.sha256(browser.cookies.get('gatherly_session').encode()).hexdigest()
            template = enrich_event(fixture())
            with app.state.db.sessions() as db:
                for index in range(args.events):
                    data = deepcopy(template)
                    data['id'] = f'benchmark-{index}'
                    db.add(EventRecord(id=data['id'], owner_hash=owner, version=1, data=data))
                db.commit()
            def read(paths):
                size = 0
                for path in paths:
                    response = browser.get(path)
                    response.raise_for_status()
                    size += len(response.content)
                return size
            old = ['/api/events']
            new = ['/api/events?summary=true', '/api/events/benchmark-0']
            output = {
                'python': platform.python_version(), 'events': args.events,
                'records_per_event': {'budget_items': 200, 'tasks': 200, 'vendors': 100},
                'samples': args.samples, 'iterations_per_sample': args.iterations,
                'all_full_plans': dict(response_bytes=read(old), **measure(lambda: read(old), args.samples, args.iterations)),
                'summaries_and_selected_plan': dict(response_bytes=read(new), **measure(lambda: read(new), args.samples, args.iterations)),
            }
            print(json.dumps(output, indent=2))


if __name__ == '__main__':
    main()
