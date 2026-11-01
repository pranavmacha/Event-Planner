from __future__ import annotations

import calendar
import hashlib
import os
import re
import secrets
from contextlib import asynccontextmanager
from copy import deepcopy
from datetime import date, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import ValidationError
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

load_dotenv(Path(__file__).resolve().parents[2] / '.env')

from . import ai
from .database import Database, EventRecord, ProposalRecord, RevisionRecord
from .planning import PlanningValidationError, baseline_plan, enrich_event, new_id, revise_plan, today, validate_dependencies
from .security import RateLimiter
from .schemas import (BudgetInput, BudgetPatch, Changes, CompareInput, EventInput,
                      ProposalInput, RestoreInput, TaskInput, TaskPatch, VendorInput, VendorPatch)

COOKIE_NAME = 'gatherly_session'
MAX_BODY_BYTES = 128 * 1024
DEFAULT_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000'


def create_app(database_url: str | None = None) -> FastAPI:
    database = Database(database_url)
    limiter = RateLimiter()

    @asynccontextmanager
    async def lifespan(_app):
        database.setup()
        yield
        database.engine.dispose()

    app = FastAPI(title='Gatherly', version='1.0.0', lifespan=lifespan)
    app.state.db = database
    app.state.limiter = limiter
    origins = [origin.strip().rstrip('/') for origin in os.getenv('ALLOWED_ORIGINS', DEFAULT_ORIGINS).split(',') if origin.strip()]
    if '*' in origins:
        raise RuntimeError('ALLOWED_ORIGINS must list explicit trusted origins; wildcard origins are not supported.')
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True,
                       allow_methods=['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
                       allow_headers=['Content-Type'], max_age=600)

    @app.middleware('http')
    async def security(request: Request, call_next):
        if request.url.path.startswith('/api'):
            origin = request.headers.get('origin')
            if origin and origin.rstrip('/') not in origins:
                return JSONResponse({'detail': 'This request origin is not allowed.'}, status_code=403)
            if request.method not in ['GET', 'HEAD', 'OPTIONS'] and request.headers.get('sec-fetch-site') == 'cross-site':
                return JSONResponse({'detail': 'Cross-site write requests are not allowed.'}, status_code=403)
            try:
                declared_size = int(request.headers.get('content-length', 0))
            except ValueError:
                return JSONResponse({'detail': 'Invalid request size.'}, status_code=400)
            if declared_size < 0:
                return JSONResponse({'detail': 'Invalid request size.'}, status_code=400)
            if declared_size > MAX_BODY_BYTES:
                return JSONResponse({'detail': 'Request is too large (maximum 128 KiB).'}, status_code=413)
            if request.method not in ['GET', 'HEAD', 'OPTIONS']:
                size = 0
                chunks = []
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > MAX_BODY_BYTES:
                        return JSONResponse({'detail': 'Request is too large (maximum 128 KiB).'}, status_code=413)
                    chunks.append(chunk)
                request._body = b''.join(chunks)
        # Health probes and static resources must not replace an event session
        # when the browser's first requests run concurrently.
        needs_session = request.url.path == '/api/events' or request.url.path.startswith('/api/events/')
        is_new = False
        if needs_session:
            token = request.cookies.get(COOKIE_NAME, '')
            is_new = not re.fullmatch(r'[A-Za-z0-9_-]{43}', token)
            if is_new:
                token = secrets.token_urlsafe(32)
            request.state.owner_hash = hashlib.sha256(token.encode()).hexdigest()
            if request.method not in ['GET', 'HEAD', 'OPTIONS']:
                try:
                    limiter.check_write(request)
                except HTTPException as exc:
                    return JSONResponse({'detail': exc.detail}, status_code=exc.status_code, headers=exc.headers)
        response = await call_next(request)
        if is_new:
            response.set_cookie(COOKIE_NAME, token, max_age=365 * 24 * 60 * 60,
                                httponly=True, secure=os.getenv('COOKIE_SECURE', 'false').lower() == 'true',
                                samesite='strict', path='/')
        return response

    @app.middleware('http')
    async def response_security(request: Request, call_next):
        response = await call_next(request)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['Referrer-Policy'] = 'same-origin'
        response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
        if os.getenv('COOKIE_SECURE', 'false').lower() == 'true':
            response.headers['Strict-Transport-Security'] = 'max-age=31536000'
        if request.url.path.startswith('/api'):
            response.headers['Cache-Control'] = 'no-store'
        return response

    @app.exception_handler(PlanningValidationError)
    async def planning_error_handler(_request, exc):
        return JSONResponse({'detail': str(exc)}, status_code=422)

    @app.exception_handler(ai.AIError)
    async def ai_error_handler(_request, exc):
        return JSONResponse({'detail': str(exc)}, status_code=503)

    @app.exception_handler(SQLAlchemyError)
    async def database_error_handler(_request, _exc):
        return JSONResponse({'detail': 'The database could not finish this request. Your saved plan is unchanged; please retry.'}, status_code=503)

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_request, exc):
        # Do not echo raw submitted bodies, credentials or vendor descriptions.
        return JSONResponse({'detail': [{'loc': list(error['loc']), 'msg': error['msg'], 'type': error['type']} for error in exc.errors()]}, status_code=422)

    def get_db():
        with database.sessions() as db:
            yield db

    def owned_event(event_id: str, request: Request, db: Session) -> EventRecord:
        record = db.scalar(select(EventRecord).where(EventRecord.id == event_id, EventRecord.owner_hash == request.state.owner_hash))
        if not record:
            raise HTTPException(404, 'Event not found.')
        return record

    def lock_owned_event(event_id: str, request: Request, db: Session) -> EventRecord:
        # A no-op UPDATE serializes deletion and proposal insertion on both
        # SQLite and Postgres, including existing databases without FK cascades.
        locked = db.execute(update(EventRecord).where(EventRecord.id == event_id,
                            EventRecord.owner_hash == request.state.owner_hash)
                            .values(version=EventRecord.version), execution_options={'synchronize_session': False})
        if locked.rowcount != 1:
            raise HTTPException(404, 'Event not found.')
        db.expire_all()
        return owned_event(event_id, request, db)

    def current_event(record: EventRecord):
        return enrich_event(record.data, record.version)

    def revision(db: Session, record: EventRecord, label: str):
        db.add(RevisionRecord(id=new_id(), event_id=record.id, version=record.version,
                              data=deepcopy(record.data), label=label[:500]))

    def save_event(db: Session, record: EventRecord, data: dict, label: str, expected_version=None):
        expected = record.version if expected_version is None else expected_version
        if expected != record.version:
            raise HTTPException(409, 'This plan has changed. Refresh it before saving your edit.')
        if data == record.data:
            return current_event(record)
        new_data = enrich_event(data, record.version + 1)
        revision(db, record, label)
        updated = db.execute(update(EventRecord).where(EventRecord.id == record.id,
                            EventRecord.owner_hash == record.owner_hash, EventRecord.version == expected)
                            .values(data=new_data, version=expected + 1), execution_options={'synchronize_session': False})
        if updated.rowcount != 1:
            db.rollback()
            raise HTTPException(409, 'This plan has changed. Refresh it before saving your edit.')
        return new_data

    def matching_item(data: dict, collection: str, item_id: str):
        for item in data[collection]:
            if item['id'] == item_id:
                return item
        raise HTTPException(404, 'Item not found in this event.')

    def validated_update(model, item: dict, patch):
        changes = patch.model_dump(mode='json', exclude_unset=True)
        expected = changes.pop('expected_version', None)
        relevant = {key: value for key, value in item.items() if key in model.model_fields}
        try:
            clean = model.model_validate({**relevant, **changes}).model_dump(mode='json')
        except ValidationError as exc:
            raise HTTPException(422, '; '.join(error['msg'] for error in exc.errors()))
        item.update(clean)
        return expected

    async def create_event_from_input(payload: EventInput, request: Request, db: Session):
        limiter.check(request)
        if payload.event_date < today():
            raise HTTPException(422, 'Choose an event date today or in the future.')
        count = db.scalar(select(func.count()).select_from(EventRecord).where(EventRecord.owner_hash == request.state.owner_hash))
        if count >= 30:
            raise HTTPException(422, 'This browser has reached the 30-event limit. Remove an older event first.')
        db.close()  # Release the pooled connection before waiting on Gemini.
        base = payload.model_dump(mode='json')
        generated = await ai.generate_plan(base)
        event = baseline_plan(base, generated, ai.get_mode())
        count = db.scalar(select(func.count()).select_from(EventRecord).where(EventRecord.owner_hash == request.state.owner_hash))
        if count >= 30:
            raise HTTPException(422, 'This browser has reached the 30-event limit. Remove an older event first.')
        record = EventRecord(id=event['id'], owner_hash=request.state.owner_hash, version=1, data=event)
        db.add(record)
        revision(db, record, 'Original generated plan')
        db.commit()
        return event

    @app.get('/api/health')
    def health():
        return {'status': 'ok', 'ai_mode': ai.get_mode()}

    @app.get('/api/events')
    def list_events(request: Request, db: Session = Depends(get_db)):
        records = db.scalars(select(EventRecord).where(EventRecord.owner_hash == request.state.owner_hash).order_by(EventRecord.created_at.desc())).all()
        return [current_event(record) for record in records]

    @app.post('/api/events', status_code=201)
    async def create_event(payload: EventInput, request: Request, db: Session = Depends(get_db)):
        return await create_event_from_input(payload, request, db)

    @app.post('/api/events/sample', status_code=201)
    async def create_sample(request: Request, db: Session = Depends(get_db)):
        now = today()
        month_index = now.month - 1 + 4
        year = now.year + month_index // 12
        month = month_index % 12 + 1
        day = min(now.day, calendar.monthrange(year, month)[1])
        payload = EventInput(name="Ananya & Arjun's wedding", occasion='Wedding', city='Bengaluru',
            event_date=date(year, month, day), budget_paise=80_000_000, guest_count=200,
            atmosphere='Warm, joyful and intimate', theme='Marigold & modern Indian',
            priorities=['food', 'logistics', 'venue', 'photography'],
            non_negotiables=['Accessible venue', 'Protect food quality'],
            dietary_preferences='Vegetarian menu with clearly labeled Jain and allergy-aware options',
            accessibility_needs='Step-free access, accessible washrooms, seating for older guests',
            cultural_preferences='A welcoming Indian family celebration with a ceremony and reception')
        return await create_event_from_input(payload, request, db)

    @app.get('/api/events/{event_id}')
    def get_event(event_id: str, request: Request, db: Session = Depends(get_db)):
        return current_event(owned_event(event_id, request, db))

    @app.delete('/api/events/{event_id}', status_code=204)
    def delete_event(event_id: str, request: Request, db: Session = Depends(get_db)):
        lock_owned_event(event_id, request, db)
        db.execute(delete(ProposalRecord).where(ProposalRecord.event_id == event_id))
        db.execute(delete(RevisionRecord).where(RevisionRecord.event_id == event_id))
        db.execute(delete(EventRecord).where(EventRecord.id == event_id, EventRecord.owner_hash == request.state.owner_hash))
        db.commit()
        return None

    @app.post('/api/events/{event_id}/budget', status_code=201)
    def add_budget(event_id: str, payload: BudgetInput, request: Request, db: Session = Depends(get_db)):
        record = owned_event(event_id, request, db)
        data = deepcopy(record.data)
        if len(data['budget_items']) >= 200:
            raise HTTPException(422, 'Maximum 200 budget items per event.')
        item = payload.model_dump(mode='json')
        # Missing guest coverage is explicit; never invent a confirmed headcount.
        if item['cost_type'] == 'per_person' and item['quote_guest_count'] is None and any(item[field] is not None for field in ['quoted_paise', 'committed_paise', 'actual_paise']):
            item['notes'] = (item['notes'] + ' Guest coverage was not specified; confirm it with the vendor.').strip()
        item.update(id=new_id(), source='user')
        data['budget_items'].append(item)
        result = save_event(db, record, data, 'Before adding a budget item')
        db.commit()
        return result

    @app.patch('/api/events/{event_id}/budget/{item_id}')
    def edit_budget(event_id: str, item_id: str, payload: BudgetPatch, request: Request, db: Session = Depends(get_db)):
        record = owned_event(event_id, request, db)
        data = deepcopy(record.data)
        item = matching_item(data, 'budget_items', item_id)
        expected = validated_update(BudgetInput, item, payload)
        item['source'] = 'user'
        result = save_event(db, record, data, 'Before editing budget: ' + item['label'], expected)
        db.commit()
        return result

    @app.post('/api/events/{event_id}/tasks', status_code=201)
    def add_task(event_id: str, payload: TaskInput, request: Request, db: Session = Depends(get_db)):
        record = owned_event(event_id, request, db)
        data = deepcopy(record.data)
        if len(data['tasks']) >= 200:
            raise HTTPException(422, 'Maximum 200 tasks per event.')
        data['tasks'].append(dict(id=new_id(), **payload.model_dump(mode='json')))
        try:
            validate_dependencies(data['tasks'])
        except ValueError as exc:
            raise HTTPException(422, str(exc))
        result = save_event(db, record, data, 'Before adding a task')
        db.commit()
        return result

    @app.patch('/api/events/{event_id}/tasks/{item_id}')
    def edit_task(event_id: str, item_id: str, payload: TaskPatch, request: Request, db: Session = Depends(get_db)):
        record = owned_event(event_id, request, db)
        data = deepcopy(record.data)
        item = matching_item(data, 'tasks', item_id)
        expected = validated_update(TaskInput, item, payload)
        try:
            validate_dependencies(data['tasks'])
        except ValueError as exc:
            raise HTTPException(422, str(exc))
        result = save_event(db, record, data, 'Before updating task: ' + item['title'], expected)
        db.commit()
        return result

    @app.post('/api/events/{event_id}/vendors', status_code=201)
    def add_vendor(event_id: str, payload: VendorInput, request: Request, db: Session = Depends(get_db)):
        record = owned_event(event_id, request, db)
        data = deepcopy(record.data)
        if len(data['vendors']) >= 100:
            raise HTTPException(422, 'Maximum 100 vendor options per event.')
        data['vendors'].append(dict(id=new_id(), **payload.model_dump(mode='json')))
        result = save_event(db, record, data, 'Before adding vendor: ' + payload.name)
        db.commit()
        return result

    @app.patch('/api/events/{event_id}/vendors/{item_id}')
    def edit_vendor(event_id: str, item_id: str, payload: VendorPatch, request: Request, db: Session = Depends(get_db)):
        record = owned_event(event_id, request, db)
        data = deepcopy(record.data)
        item = matching_item(data, 'vendors', item_id)
        expected = validated_update(VendorInput, item, payload)
        result = save_event(db, record, data, 'Before editing vendor: ' + item['name'], expected)
        db.commit()
        return result

    @app.delete('/api/events/{event_id}/{collection}/{item_id}')
    def remove_item(event_id: str, collection: str, item_id: str, request: Request, expected_version: int | None = None, db: Session = Depends(get_db)):
        key = {'budget': 'budget_items', 'tasks': 'tasks', 'vendors': 'vendors'}.get(collection)
        if not key:
            raise HTTPException(404, 'Collection not found.')
        record = owned_event(event_id, request, db)
        data = deepcopy(record.data)
        matching_item(data, key, item_id)
        if key == 'tasks' and any(item_id in task['dependencies'] for task in data['tasks']):
            raise HTTPException(422, 'Remove this task from dependent tasks before deleting it.')
        data[key] = [item for item in data[key] if item['id'] != item_id]
        result = save_event(db, record, data, f'Before removing a {collection} item', expected_version)
        db.commit()
        return result

    @app.post('/api/events/{event_id}/vendors/compare')
    async def compare(event_id: str, payload: CompareInput, request: Request, db: Session = Depends(get_db)):
        record = owned_event(event_id, request, db)
        if len(set(payload.vendor_ids)) != len(payload.vendor_ids):
            raise HTTPException(422, 'Choose at least two different vendor options.')
        vendors = [matching_item(record.data, 'vendors', item_id) for item_id in payload.vendor_ids]
        limiter.check(request)
        snapshot = current_event(record)
        db.close()
        return await ai.compare_vendors(snapshot, vendors)

    def proposal_response(record: ProposalRecord):
        return {**record.data, 'id': record.id, 'base_version': record.base_version, 'status': record.status, 'message': record.message}

    def get_proposal(db: Session, event_id: str, proposal_id: str):
        proposal = db.scalar(select(ProposalRecord).where(ProposalRecord.id == proposal_id, ProposalRecord.event_id == event_id))
        if not proposal:
            raise HTTPException(404, 'Proposal not found.')
        return proposal

    @app.post('/api/events/{event_id}/proposals')
    async def propose(event_id: str, payload: ProposalInput, request: Request, db: Session = Depends(get_db)):
        record = owned_event(event_id, request, db)
        existing = db.scalar(select(ProposalRecord).where(ProposalRecord.event_id == event_id, ProposalRecord.request_id == payload.request_id))
        if existing:
            if existing.message != payload.message:
                raise HTTPException(409, 'This request ID was already used for a different change request.')
            return proposal_response(existing)
        limiter.check(request)
        before = current_event(record)
        base_version = record.version
        db.close()
        extracted = await ai.extract_changes(payload.message, before)
        if extracted.get('clarification'):
            return {'clarification': extracted['clarification'], 'ai_mode': ai.get_mode()}
        try:
            changes = Changes.model_validate(extracted.get('changes', {})).model_dump(mode='json', exclude_none=True)
        except ValidationError:
            raise HTTPException(422, 'The proposed changes contain an invalid date, amount, guest count or priority. Please be more specific.')
        changes = {key: value for key, value in changes.items() if before[key] != value}
        if not changes:
            return {'clarification': 'Please specify a new guest count, total budget, event date or ranked priorities. Your current plan is unchanged.', 'ai_mode': ai.get_mode()}
        if 'event_date' in changes and date.fromisoformat(changes['event_date']) < today():
            raise HTTPException(422, 'The proposed event date is in the past. Please choose today or a future date.')
        after, impacts = revise_plan(before, changes)
        explanation = await ai.explain_revision(before, after, impacts)
        data = dict(changes=changes, before=before, after=after,
                    category_impacts=impacts['category_impacts'], task_impacts=impacts['task_impacts'],
                    tradeoffs=explanation.get('tradeoffs', []),
                    warnings=list(dict.fromkeys(impacts['warnings'] + explanation.get('warnings', []))),
                    assumptions=['Recorded quotes, commitments, spending, bookings and non-negotiables are preserved. Only the explicit proposed fields and unfinished task deadlines change.'] + explanation.get('assumptions', []),
                    ai_mode=ai.get_mode())
        # A plan can be changed or deleted while the model is responding.
        record = lock_owned_event(event_id, request, db)
        if record.version != base_version:
            raise HTTPException(409, 'This plan changed while the preview was generated. Please try again.')
        proposal = ProposalRecord(id=new_id(), event_id=event_id, request_id=payload.request_id,
                                  base_version=base_version, status='pending', message=payload.message, data=data)
        db.add(proposal)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            concurrent = db.scalar(select(ProposalRecord).where(ProposalRecord.event_id == event_id, ProposalRecord.request_id == payload.request_id))
            if concurrent and concurrent.message == payload.message:
                return proposal_response(concurrent)
            raise HTTPException(409, 'This request ID was already used. Retry with a new request ID.')
        return proposal_response(proposal)

    @app.post('/api/events/{event_id}/proposals/{proposal_id}/apply')
    def apply_proposal(event_id: str, proposal_id: str, request: Request, db: Session = Depends(get_db)):
        record = owned_event(event_id, request, db)
        proposal = get_proposal(db, event_id, proposal_id)
        if proposal.status == 'applied':
            return current_event(record)
        if proposal.status == 'discarded':
            raise HTTPException(409, 'This proposal was discarded. Generate a new proposal.')
        if proposal.base_version != record.version:
            raise HTTPException(409, 'This proposal is stale because the saved plan changed. Generate a new proposal from the current plan.')
        result = save_event(db, record, proposal.data['after'], 'Before applying change: ' + proposal.message, proposal.base_version)
        status_update = db.execute(update(ProposalRecord).where(ProposalRecord.id == proposal.id, ProposalRecord.status == 'pending').values(status='applied'), execution_options={'synchronize_session': False})
        if status_update.rowcount != 1:
            db.rollback()
            raise HTTPException(409, 'This proposal was changed by another request. Refresh the plan.')
        db.commit()
        return result

    @app.post('/api/events/{event_id}/proposals/{proposal_id}/discard')
    def discard_proposal(event_id: str, proposal_id: str, request: Request, db: Session = Depends(get_db)):
        owned_event(event_id, request, db)
        proposal = get_proposal(db, event_id, proposal_id)
        if proposal.status == 'applied':
            raise HTTPException(409, 'An applied proposal cannot be discarded. Restore a revision instead.')
        if proposal.status == 'discarded':
            return {'status': 'discarded'}
        changed = db.execute(update(ProposalRecord).where(ProposalRecord.id == proposal.id, ProposalRecord.status == 'pending').values(status='discarded'), execution_options={'synchronize_session': False})
        if changed.rowcount != 1:
            db.rollback()
            raise HTTPException(409, 'This proposal was already changed. Refresh the plan.')
        db.commit()
        return {'status': 'discarded'}

    @app.get('/api/events/{event_id}/revisions')
    def revisions(event_id: str, request: Request, db: Session = Depends(get_db)):
        if db.scalar(select(EventRecord.id).where(EventRecord.id == event_id,
                      EventRecord.owner_hash == request.state.owner_hash)) is None:
            raise HTTPException(404, 'Event not found.')
        records = db.execute(select(RevisionRecord.id, RevisionRecord.created_at, RevisionRecord.label,
                                    RevisionRecord.version, RevisionRecord.restored)
                             .where(RevisionRecord.event_id == event_id)
                             .order_by(RevisionRecord.created_at.desc())).all()
        return [dict(id=item.id, created_at=(item.created_at if item.created_at.tzinfo is not None else item.created_at.replace(tzinfo=timezone.utc)).isoformat(), label=item.label, version=item.version, restored=bool(item.restored)) for item in records]

    @app.post('/api/events/{event_id}/revisions/{revision_id}/restore')
    def restore(event_id: str, revision_id: str, payload: RestoreInput, request: Request, db: Session = Depends(get_db)):
        record = owned_event(event_id, request, db)
        snapshot = db.scalar(select(RevisionRecord).where(RevisionRecord.id == revision_id, RevisionRecord.event_id == event_id))
        if not snapshot:
            raise HTTPException(404, 'Revision not found.')
        result = save_event(db, record, snapshot.data,
                            f'Before restoring version {snapshot.version}: {snapshot.label}', payload.expected_version)
        snapshot.restored = 1
        db.commit()
        return result

    # Serve the production Vite build and history URLs. API misses must stay JSON 404s.
    static_dir = Path(os.getenv('STATIC_DIR', str(Path(__file__).resolve().parents[2] / 'frontend' / 'dist'))).resolve()

    @app.get('/{path:path}', include_in_schema=False)
    def frontend(path: str):
        if path == 'api' or path.startswith('api/'):
            raise HTTPException(404, 'API route not found.')
        if any(part.startswith('.') for part in Path(path).parts):
            raise HTTPException(404, 'File not found.')
        candidate = (static_dir / path).resolve()
        if candidate.is_relative_to(static_dir) and candidate.is_file():
            cache = 'public, max-age=31536000, immutable' if path.startswith('assets/') and re.search(r'-[\w-]{8,}\.', candidate.name) else 'no-cache'
            if candidate.suffix == '.html':
                return frontend_html(candidate)
            return FileResponse(candidate, headers={'Cache-Control': cache})
        if path.startswith('assets/'):
            raise HTTPException(404, 'Asset not found.')
        index = static_dir / 'index.html'
        if index.is_file():
            return frontend_html(index)
        raise HTTPException(404, 'Frontend build not found. Run the Vite frontend or build it first.')

    def frontend_html(path: Path):
        return FileResponse(path, headers={
            'Cache-Control': 'no-cache',
            'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
        })

    return app


app = create_app()
