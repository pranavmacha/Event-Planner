from copy import deepcopy
from datetime import date

import pytest

from app.planning import enrich_event, enrich_tasks, project_item, revise_plan, validate_dependencies


def item(**overrides):
    result = dict(id='one', category='food', label='Food', cost_type='per_person',
                  estimate_paise=100_000, quoted_paise=None, committed_paise=None,
                  actual_paise=None, quote_guest_count=None, source='estimate', notes='')
    result.update(overrides)
    return result


def task(id, deps=None, **overrides):
    result = dict(id=id, title=id, due_date='2027-06-10', priority='high',
                  status='todo', dependencies=deps or [], notes='')
    result.update(overrides)
    return result


def test_fixed_and_per_guest_costs():
    assert project_item(item(), 200)['projected_paise'] == 20_000_000
    assert project_item(item(), 250)['projected_paise'] == 25_000_000
    assert project_item(item(cost_type='fixed'), 250)['projected_paise'] == 100_000


def test_committed_quote_and_estimate_are_not_double_counted():
    row = item(quoted_paise=19_000_000, committed_paise=18_000_000, actual_paise=1_000_000, quote_guest_count=200)
    result = project_item(row, 200)
    assert result['projected_paise'] == 18_000_000
    assert result['projection_basis'] == 'committed'
    assert row['actual_paise'] == 1_000_000


def test_partial_payment_does_not_reduce_committed_forecast():
    assert project_item(item(cost_type='fixed', committed_paise=10_000_000, actual_paise=1_000_000), 200)['projected_paise'] == 10_000_000
    assert project_item(item(cost_type='fixed', committed_paise=10_000_000, actual_paise=12_000_000), 200)['projected_paise'] == 12_000_000


def test_zero_quote_or_commitment_is_valid():
    assert project_item(item(quoted_paise=0), 200)['projected_paise'] == 0
    assert project_item(item(quoted_paise=5000, committed_paise=0), 200)['projected_paise'] == 0


def test_extra_guests_create_explicit_exposure_without_scaling_commitment():
    row = item(quoted_paise=19_000_000, committed_paise=18_000_000, quote_guest_count=200)
    result = project_item(row, 250)
    assert result['projected_paise'] == 23_000_000
    assert result['committed_paise'] == 18_000_000
    assert '50 additional guests' in result['projection_basis']
    assert project_item(row, 150)['projected_paise'] == 18_000_000


def test_actual_above_forecast_is_not_counted_again_with_exposure():
    row = item(committed_paise=18_000_000, actual_paise=25_000_000, quote_guest_count=200)
    assert project_item(row, 250)['projected_paise'] == 25_000_000


def test_unspecified_coverage_is_explicit_not_invented():
    result = project_item(item(quoted_paise=18_000_000), 250)
    assert result['projected_paise'] == 18_000_000
    assert 'coverage unconfirmed' in result['projection_basis']


def test_dependency_graph_rejects_cycles_foreign_ids_and_duplicates():
    validate_dependencies([task('a'), task('b', ['a']), task('c', ['b'])])
    for tasks in [[task('a', ['b']), task('b', ['a'])], [task('a', ['other-event'])], [task('a', ['a'])], [task('a'), task('b', ['a', 'a'])]]:
        with pytest.raises(ValueError):
            validate_dependencies(tasks)


def test_dependency_completion_and_overdue_predecessors():
    tasks = [task('venue'), task('invitations', ['venue'])]
    assert enrich_tasks(tasks, '2027-07-01', date(2027, 6, 1))[1]['readiness'] == 'blocked'
    tasks[0]['status'] = 'done'
    assert enrich_tasks(tasks, '2027-07-01', date(2027, 6, 1))[1]['readiness'] == 'ready'
    tasks[0]['status'] = 'todo'
    tasks[0]['due_date'] = '2027-05-30'
    result = enrich_tasks(tasks, '2027-07-01', date(2027, 6, 1))[1]
    assert result['readiness'] == 'at_risk'
    assert any('overdue' in reason for reason in result['reasons'])


def test_impossible_dependency_dates_are_flagged():
    tasks = [task('venue', due_date='2027-06-20'), task('invites', ['venue'], due_date='2027-06-10')]
    assert enrich_tasks(tasks, '2027-07-01', date(2027, 6, 1))[1]['readiness'] == 'at_risk'


def test_summary_reserve_remaining_and_overspend():
    data = dict(version=1, budget_paise=20_000_000, guest_count=200,
                event_date='2027-07-01', budget_items=[item()], tasks=[])
    summary = enrich_event(data, as_of=date(2027, 6, 1))['summary']
    assert summary['reserve_paise'] == 2_000_000
    assert summary['remaining_paise'] == -2_000_000
    assert summary['overspend_paise'] == 2_000_000
    assert summary['category_totals']['food'] == 20_000_000
    assert summary['days_remaining'] == 30


def test_revision_only_shifts_unfinished_tasks_and_preserves_commitments(event):
    before = deepcopy(event)
    before['tasks'][0]['status'] = 'done'
    before['budget_items'][0].update(committed_paise=18_000_000, actual_paise=2_000_000, quote_guest_count=200)
    before = enrich_event(before)
    after, impacts = revise_plan(before, dict(guest_count=250, budget_paise=70_000_000, event_date='2027-06-01'))
    assert after['tasks'][0]['due_date'] == before['tasks'][0]['due_date']
    assert len(impacts['task_impacts']) == len(before['tasks']) - 1
    assert after['non_negotiables'] == before['non_negotiables']
    assert after['budget_items'][0]['committed_paise'] == 18_000_000
    assert after['budget_items'][0]['actual_paise'] == 2_000_000
    assert '250 guests' in after['concept']
    assert '200 guests' not in after['concept']
