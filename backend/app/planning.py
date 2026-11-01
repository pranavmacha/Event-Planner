"""Deterministic money, scheduling and constraint logic; never delegated to AI."""
from __future__ import annotations

from copy import deepcopy
from datetime import date, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo
from datetime import datetime

CATEGORIES = ['food', 'venue', 'decor', 'photography', 'entertainment', 'logistics', 'other']
MAX_SAFE_INTEGER = 2**53 - 1
DEPENDENCY_REASON_EXAMPLES = 3


class PlanningValidationError(ValueError):
    """A safe planning constraint error that leaves saved data untouched."""


def safe_money(amount: int) -> int:
    if abs(amount) > MAX_SAFE_INTEGER:
        raise PlanningValidationError('This plan exceeds the supported exact monetary range. Reduce the entered amount or guest count; no values were saved.')
    return amount


def today() -> date:
    return datetime.now(ZoneInfo('Asia/Kolkata')).date()


def new_id() -> str:
    return str(uuid4())


def project_item(item: dict, guest_count: int) -> dict:
    item = deepcopy(item)
    estimate = item['estimate_paise'] * (guest_count if item['cost_type'] == 'per_person' else 1)
    basis = 'estimated'
    amount = estimate
    for field, label in [('committed_paise', 'committed'), ('quoted_paise', 'quoted')]:
        if item.get(field) is not None:
            amount = item[field]
            basis = label
            break
    exposure = 0
    covered = item.get('quote_guest_count')
    if basis != 'estimated' and item['cost_type'] == 'per_person' and covered is not None:
        exposure = max(0, guest_count - covered) * item['estimate_paise']
    forecast = amount + exposure
    actual = item.get('actual_paise') or 0
    item['projected_paise'] = safe_money(max(actual, forecast))
    if exposure:
        basis += f' + estimated exposure for {guest_count - covered} additional guests'
    elif basis != 'estimated' and item['cost_type'] == 'per_person' and covered is None:
        basis += ' (guest coverage unconfirmed; confirm any extra guest charges)'
    if actual > forecast:
        basis = 'actual spending exceeds ' + basis
    item['projection_basis'] = basis
    return item


def validate_dependencies(tasks: list[dict]) -> None:
    by_id = {task['id']: task for task in tasks}
    for task in tasks:
        dependencies = task['dependencies']
        if len(dependencies) != len(set(dependencies)):
            raise ValueError('Task dependencies must be unique.')
        if any(dep not in by_id for dep in dependencies):
            raise ValueError('Every dependency must be a task in this event.')
    visited, visiting = set(), set()

    def visit(task_id):
        if task_id in visiting:
            raise ValueError('Task dependencies cannot form a cycle.')
        if task_id in visited:
            return
        visiting.add(task_id)
        for dependency in by_id[task_id]['dependencies']:
            visit(dependency)
        visiting.remove(task_id)
        visited.add(task_id)

    for task_id in by_id:
        visit(task_id)


def enrich_tasks(tasks: list[dict], event_date: str, as_of: date) -> list[dict]:
    by_id = {task['id']: task for task in tasks}
    event_day = date.fromisoformat(event_date)
    due_dates = {task['id']: date.fromisoformat(task['due_date'])
                 for task in tasks if task['status'] != 'done'}
    result = deepcopy(tasks)
    for task in result:
        reasons = []
        if task['status'] == 'done':
            task.update(readiness='done', reasons=['Completed.'])
            continue
        due = due_dates[task['id']]
        waiting = [by_id[dep] for dep in task['dependencies'] if by_id[dep]['status'] != 'done']
        risk = False
        if due < as_of:
            reasons.append('Deadline has passed; agree a new feasible date.')
            risk = True
        if due > event_day:
            reasons.append('Deadline falls after the event; reschedule before the celebration.')
            risk = True
        # Evaluate every prerequisite, but bound repeated title text in the
        # response and stored snapshots. Each issue keeps its full count.
        overdue = [predecessor for predecessor in waiting if due_dates[predecessor['id']] < as_of]
        scheduled_later = [predecessor for predecessor in waiting if due_dates[predecessor['id']] > due]
        risk = risk or bool(overdue) or bool(scheduled_later)
        for label, predecessors in [('Waiting for prerequisites', waiting),
                                    ('Prerequisites overdue', overdue),
                                    ('Prerequisites scheduled after this task', scheduled_later)]:
            if not predecessors:
                continue
            examples = '; '.join(predecessor['title'] for predecessor in predecessors[:DEPENDENCY_REASON_EXAMPLES])
            remaining = len(predecessors) - DEPENDENCY_REASON_EXAMPLES
            suffix = f'; and {remaining} more' if remaining > 0 else ''
            reasons.append(f'{label} ({len(predecessors)}): {examples}{suffix}.')
        task['readiness'] = 'at_risk' if risk else 'blocked' if waiting else 'ready'
        task['reasons'] = reasons or ['All prerequisites are complete; this task is ready to start.']
    return result


def enrich_event(data: dict, version: int | None = None, as_of: date | None = None) -> dict:
    event = deepcopy(data)
    as_of = as_of or today()
    if version is not None:
        event['version'] = version
    event['budget_items'] = [project_item(item, event['guest_count']) for item in event['budget_items']]
    event['tasks'] = enrich_tasks(event['tasks'], event['event_date'], as_of)
    for vendor in event.get('vendors', []):
        vendor['total_paise'] = safe_money(vendor['quoted_paise'] + vendor['taxes_paise'] + vendor['additional_charges_paise'])
    totals = {category: 0 for category in CATEGORIES}
    for item in event['budget_items']:
        totals[item['category']] += item['projected_paise']
    projected = safe_money(sum(totals.values()))
    reserve = event['budget_paise'] // 10
    safe_money(projected + reserve)
    remaining = safe_money(event['budget_paise'] - projected - reserve)
    event['summary'] = {
        'projected_paise': projected,
        'reserve_paise': reserve,
        'remaining_paise': remaining,
        'overspend_paise': max(0, -remaining),
        'committed_paise': sum(item['committed_paise'] or 0 for item in event['budget_items']),
        'actual_paise': sum(item['actual_paise'] or 0 for item in event['budget_items']),
        'days_remaining': (date.fromisoformat(event['event_date']) - as_of).days,
        'completed_tasks': sum(task['status'] == 'done' for task in event['tasks']),
        'total_tasks': len(event['tasks']),
        'category_totals': totals,
    }
    return event


def baseline_plan(event: dict, ai_result: dict, mode: str) -> dict:
    data = deepcopy(event)
    data.update(id=new_id(), version=1, ai_mode=mode, concept=ai_result['concept'],
                decisions=ai_result.get('decisions', []), risks=ai_result.get('risks', []), vendors=[])
    data['assumptions'] = [
        'All initial prices are illustrative planning estimates derived from your budget, not verified local market rates.',
        'Projected spending is the higher of actual spending to date and the committed, quoted or estimated forecast (in that order). Stages are never added together for one expense.',
        'A 10% contingency reserve is held separately; existing estimates do not shrink automatically when your budget changes.',
        'Per-person confirmed totals stay unchanged. Additional guests beyond recorded coverage create explicit estimated exposure.',
    ] + ai_result.get('assumptions', [])
    # Allocate 85% initially, leaving 10% reserve and 5% breathing room. Ranked
    # priorities influence only these starting estimates, never later user amounts.
    weights = {'food': 36, 'venue': 22, 'decor': 13, 'photography': 10, 'entertainment': 6, 'logistics': 8, 'other': 5}
    for index, priority in enumerate(event['priorities'][:4]):
        normalized = priority.lower()
        for category in CATEGORIES:
            if category in normalized or (category == 'decor' and 'decoration' in normalized) or (category == 'logistics' and 'comfort' in normalized):
                weights[category] += 8 - index * 2
                break
    estimate_pool = event['budget_paise'] * 85 // 100
    total_weight = sum(weights.values())
    labels = {'food': 'Catering & refreshments', 'venue': 'Venue & essential facilities', 'decor': 'Flowers & decoration', 'photography': 'Photography & memories', 'entertainment': 'Music & celebration', 'logistics': 'Guest transport & comfort', 'other': 'Invitations & essentials'}
    data['budget_items'] = []
    for category in CATEGORIES:
        per_person = category in ['food', 'logistics']
        category_estimate = estimate_pool * weights[category] // total_weight
        unit = category_estimate // event['guest_count'] if per_person else category_estimate
        data['budget_items'].append(dict(id=new_id(), category=category, label=labels[category],
            cost_type='per_person' if per_person else 'fixed', estimate_paise=unit,
            quoted_paise=None, committed_paise=None, actual_paise=None, quote_guest_count=None,
            source='estimate', notes='Illustrative estimate allocated from your budget. Replace with a real quotation.' + (' Estimate is per guest.' if per_person else ' Estimate is a fixed total.')))
    definitions = [
        ('Confirm guest list & essential requirements', 100, 'high', [], 'Record dietary, accessibility and cultural requirements before asking vendors for quotes.'),
        ('Shortlist accessible venues', 90, 'high', [0], 'Check step-free access, accessible toilets, seating, parking, capacity and date availability.'),
        ('Compare catering quotations & tasting', 75, 'high', [0], 'Request written per-person pricing, taxes, guest coverage, menu, dietary options and cancellation terms.'),
        ('Confirm venue booking', 65, 'high', [1], 'Review inclusions and cancellation terms. Record deposits and commitments in the budget.'),
        ('Confirm caterer & service plan', 55, 'high', [2, 3], 'Agree menu quality, service staffing, extra guest rates and dietary handling.'),
        ('Choose decor, photography & music', 45, 'medium', [3], 'Share your theme and non-negotiables. Compare written inclusions and exclusions.'),
        ('Send invitations & collect RSVPs', 35, 'medium', [3], 'Include directions, timings and an accessibility contact.'),
        ('Confirm guest transport & accessibility', 21, 'high', [6], 'Assign a host to coordinate transport, older guests and accessibility arrangements.'),
        ('Lock guest count & vendor confirmations', 10, 'high', [4, 6], 'Confirm final headcount and written extra guest costs. Check all recorded availability.'),
        ('Share final run sheet & payment checklist', 3, 'high', [5, 7, 8], 'Confirm arrival times, responsibilities, outstanding balances and emergency contacts.'),
    ]
    event_day = date.fromisoformat(event['event_date'])
    task_ids = [new_id() for _ in definitions]
    data['tasks'] = []
    for index, (title, days_before, priority, dependencies, notes) in enumerate(definitions):
        data['tasks'].append(dict(id=task_ids[index], title=title,
            due_date=(event_day - timedelta(days=days_before)).isoformat(), priority=priority,
            status='todo', dependencies=[task_ids[dep] for dep in dependencies], notes=notes))
    existing_titles = {task['title'].lower() for task in data['tasks']}
    for suggestion in ai_result.get('task_suggestions', [])[:6]:
        if suggestion['title'].lower() in existing_titles:
            continue
        data['tasks'].append(dict(id=new_id(), title=suggestion['title'],
            due_date=(event_day - timedelta(days=suggestion['days_before'])).isoformat(),
            priority=suggestion['priority'], status='todo', dependencies=[], notes=suggestion['notes']))
    if (event_day - today()).days < 100:
        data['risks'].append('The planning window is compressed: some recommended deadlines are already past. Prioritize prerequisite tasks and confirm feasible dates with vendors.')
    validate_dependencies(data['tasks'])
    return enrich_event(data)


def revise_plan(before: dict, changes: dict) -> tuple[dict, dict]:
    after = deepcopy(before)
    old_day = date.fromisoformat(before['event_date'])
    after.update(changes)
    # A generated concept may contain old counts or dates. Refresh its factual
    # framing from preferences instead of carrying stale prose into the revision.
    after['concept'] = (f"{after['name']}: a {after['atmosphere'].lower() or 'joyful'} {after['occasion'].lower()} "
        f"in {after['city']} for {after['guest_count']} guests on {after['event_date']}. "
        + (f"Theme: {after['theme']}. " if after['theme'] else '')
        + f"Priorities: {', '.join(after['priorities'])}.")
    delta = date.fromisoformat(after['event_date']) - old_day
    task_impacts = []
    for task in after['tasks']:
        if delta.days and task['status'] != 'done':
            before_date = task['due_date']
            try:
                task['due_date'] = (date.fromisoformat(before_date) + delta).isoformat()
            except (OverflowError, ValueError):
                raise PlanningValidationError('A task deadline cannot move by this date change because it would fall outside the supported calendar. Correct the task date and retry.') from None
            task_impacts.append(dict(id=task['id'], title=task['title'], before_date=before_date,
                after_date=task['due_date'], reason=f'Deadline moves with the event date ({delta.days:+d} days). Completed tasks keep their dates.'))
    after = enrich_event(after, before['version'] + 1)
    category_impacts = []
    for category in CATEGORIES:
        old_total = before['summary']['category_totals'][category]
        new_total = after['summary']['category_totals'][category]
        if old_total != new_total:
            category_impacts.append(dict(category=category, before_paise=old_total, after_paise=new_total,
                reason='Per-person estimates reflect the new guest count. Recorded quotes, commitments and actuals are preserved; uncovered extra guests are estimated separately.'))
    warnings = []
    if after['summary']['overspend_paise']:
        warnings.append('The revised plan exceeds the budget including the 10% reserve. No expense has been hidden or reduced to manufacture a balanced plan.')
    at_risk = [task for task in after['tasks'] if task['readiness'] == 'at_risk']
    if at_risk:
        warnings.append(f'{len(at_risk)} unfinished tasks have overdue or inconsistent deadlines; confirm a feasible sequence.')
    if delta.days:
        booked = [vendor['name'] for vendor in after['vendors'] if vendor['booking_status'] == 'booked']
        warnings.append('Vendor availability is not reconfirmed automatically when the event date changes.' + (f" Contact booked vendors: {', '.join(booked)}." if booked else ''))
    for item in after['budget_items']:
        if 'coverage unconfirmed' in item['projection_basis']:
            warnings.append(f"Confirm guest coverage for {item['label']}; its recorded amount was preserved and extra charges are unknown.")
    return after, dict(category_impacts=category_impacts, task_impacts=task_impacts, warnings=warnings)
