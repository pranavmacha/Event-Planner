"""Regression coverage for single-copy planning transformations."""
from copy import deepcopy
from datetime import date

from app.planning import enrich_event, enrich_tasks, project_item, revise_plan


def test_enrichment_owns_nested_records_and_recomputes_date_dependent_state():
    source = dict(
        version=1, budget_paise=100_000, guest_count=10, event_date='2027-07-01',
        priorities=['food'], metadata={'host': ['Family']},
        budget_items=[dict(id='food', category='food', cost_type='per_person',
                           estimate_paise=100, committed_paise=None, actual_paise=None,
                           metadata={'contacts': ['Caterer']})],
        tasks=[dict(id='venue', title='Venue', due_date='2027-06-10', status='todo', dependencies=[]),
               dict(id='invite', title='Invitations', due_date='2027-06-20', status='todo', dependencies=['venue'])],
        vendors=[dict(id='vendor', quoted_paise=100, taxes_paise=10, additional_charges_paise=5,
                      metadata={'contacts': ['Vendor']})],
    )
    untouched = deepcopy(source)
    before_deadline = enrich_event(source, version=2, as_of=date(2027, 6, 1))
    after_deadline = enrich_event(before_deadline, as_of=date(2027, 6, 11))
    assert before_deadline['tasks'][1]['readiness'] == 'blocked'
    assert after_deadline['tasks'][1]['readiness'] == 'at_risk'
    assert after_deadline['summary']['days_remaining'] == 20
    before_deadline['metadata']['host'].append('Changed')
    before_deadline['priorities'].append('venue')
    before_deadline['budget_items'][0]['metadata']['contacts'].append('Changed')
    before_deadline['tasks'][1]['dependencies'].clear()
    before_deadline['vendors'][0]['metadata']['contacts'].append('Changed')
    assert source == untouched
    assert after_deadline['tasks'][1]['dependencies'] == ['venue']


def test_individual_transformations_keep_nested_input_isolated():
    item = dict(estimate_paise=100, cost_type='fixed', metadata={'notes': ['Original']})
    projected = project_item(item, 10)
    projected['metadata']['notes'].append('Changed')
    assert item['metadata']['notes'] == ['Original']

    tasks = [dict(id='venue', title='Venue', due_date='2027-06-10', status='todo',
                  dependencies=[], metadata={'notes': ['Original']})]
    enriched = enrich_tasks(tasks, '2027-07-01', date(2027, 6, 1))
    enriched[0]['metadata']['notes'].append('Changed')
    assert tasks[0]['metadata']['notes'] == ['Original']
    assert 'readiness' not in tasks[0]


def test_revision_does_not_share_mutable_changes_or_before_state(event):
    before = deepcopy(event)
    changes = {'priorities': ['venue', 'food']}
    revised, _ = revise_plan(event, changes)
    revised['priorities'].append('decor')
    revised['tasks'][1]['dependencies'].clear()
    revised['budget_items'][0]['notes'] = 'Changed'
    assert changes == {'priorities': ['venue', 'food']}
    assert event == before
