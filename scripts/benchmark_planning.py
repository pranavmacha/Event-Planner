#!/usr/bin/env python3
"""Measure deterministic planning CPU time and Python allocations, without AI/DB.

Run with backend/.venv/bin/python scripts/benchmark_planning.py. To compare an
older implementation, export its planning.py and pass --planning-module PATH.
Timing excludes tracing overhead, fixture construction and JSON serialization;
peak bytes cover one operation (input storage is allocated before tracing).
"""
from __future__ import annotations

import argparse
import gc
import importlib.util
import json
from pathlib import Path
import platform
from statistics import median
from time import perf_counter
import tracemalloc
from datetime import date, timedelta


AS_OF = date(2027, 6, 1)


def fixture() -> dict:
    """Allowed record limits, realistic notes and a dense valid task graph."""
    categories = ['food', 'venue', 'decor', 'photography', 'entertainment', 'logistics', 'other']
    return dict(
        id='benchmark', version=1, name='Family celebration', occasion='Wedding',
        city='Bengaluru', event_date='2027-10-01', budget_paise=500_000_000,
        guest_count=300, atmosphere='Warm and joyful', theme='Marigold',
        priorities=['food', 'venue', 'decor'], non_negotiables=['Step-free access'],
        budget_items=[dict(
            id=f'item-{index}', category=categories[index % len(categories)],
            label=f'Expense {index}', cost_type='per_person' if index % 3 == 0 else 'fixed',
            estimate_paise=10_000, quoted_paise=3_500_000 if index % 4 == 0 else None,
            committed_paise=3_000_000 if index % 5 == 0 else None,
            actual_paise=500_000 if index % 7 == 0 else None, quote_guest_count=250,
            source='user', notes='Confirm service scope and final written pricing. ' * 10,
        ) for index in range(200)],
        tasks=[dict(
            id=f'task-{index}', title=f'Task {index}: confirm vendor and family arrangements',
            due_date=(AS_OF + timedelta(days=index % 90 - 30)).isoformat(),
            priority='high', status='done' if index % 7 == 0 else 'todo',
            dependencies=[f'task-{dep}' for dep in range(max(0, index - 50), index)],
            notes='Coordinate the written requirements with the assigned family host. ' * 10,
        ) for index in range(200)],
        vendors=[dict(
            id=f'vendor-{index}', name=f'Quotation {index}', category=categories[index % len(categories)],
            quoted_paise=100_000, taxes_paise=18_000, additional_charges_paise=5_000,
            booking_status='booked' if index % 8 == 0 else 'considering',
            inclusions='Service staff, setup and cleanup. ' * 10,
            exclusions='Additional guest charges must be confirmed. ' * 10,
            notes='Contact the vendor to confirm availability and payment terms. ' * 10,
        ) for index in range(100)],
    )


def measure(operation, samples: int, iterations: int) -> dict:
    operation()
    elapsed = []
    for _ in range(samples):
        gc.collect()
        start = perf_counter()
        for _ in range(iterations):
            operation()
        elapsed.append((perf_counter() - start) * 1000 / iterations)
    peaks = []
    for _ in range(samples):
        gc.collect()
        tracemalloc.start()
        operation()
        _, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        peaks.append(peak)
    return {'median_ms': round(median(elapsed), 3), 'peak_bytes': int(median(peaks))}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--planning-module', type=Path,
                        default=Path(__file__).resolve().parents[1] / 'backend/app/planning.py')
    parser.add_argument('--samples', type=int, default=7)
    parser.add_argument('--iterations', type=int, default=50)
    args = parser.parse_args()
    if args.samples < 1 or args.iterations < 1:
        parser.error('Samples and iterations must be positive.')
    spec = importlib.util.spec_from_file_location('planning_benchmark', args.planning_module)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.today = lambda: AS_OF
    event = module.enrich_event(fixture(), as_of=AS_OF)
    module.validate_dependencies(event['tasks'])
    changes = {'guest_count': 350, 'event_date': '2027-11-01'}
    print(json.dumps({
        'python': platform.python_version(), 'planning_module': str(args.planning_module),
        'samples': args.samples, 'iterations_per_sample': args.iterations,
        'records': {'budget_items': 200, 'tasks': 200, 'vendors': 100},
        'dependency_edges': sum(len(task['dependencies']) for task in event['tasks']),
        'input_json_bytes': len(json.dumps(event).encode()),
        'enrich_event': measure(lambda: module.enrich_event(event, as_of=AS_OF), args.samples, args.iterations),
        'revise_plan': measure(lambda: module.revise_plan(event, changes), args.samples, args.iterations),
    }, indent=2))


if __name__ == '__main__':
    main()
