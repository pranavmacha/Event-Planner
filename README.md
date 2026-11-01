# Gatherly

A working event planner for Indian family celebrations, prepared for **Google Prompt Wars Virtual Challenge 5: Celebration and Event Planner**.

Describe an event → generate an editable plan → track costs, tasks and vendor choices → preview a change → apply or discard it → restore a prior version. The interface uses ivory, deep plum and coral, and takes you directly into planning.

## Run locally

Requirements: Node.js 22+ and Python 3.11+ (3.12 is verified and recommended). The locked dependency set requires Python 3.11 or newer.

```bash
cd gatherly
cp .env.example .env
python3.12 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.lock.txt
cd frontend
npm ci
cd ..
./scripts/dev.sh
```

Open **http://127.0.0.1:5173**. The API is **http://127.0.0.1:8000**, with interactive documentation at `/docs`. Run backend commands from `backend` so the default SQLite file is `backend/data/gatherly.db`.

If Python 3.12 is not installed, install it with your normal package manager, or use an installed `uv`: run `uv python install 3.12`, `uv venv backend/.venv --python 3.12`, then `uv pip install --python backend/.venv/bin/python -r backend/requirements.lock.txt`. The uv-created environment need not include pip. This development session already prepared `backend/.venv`; the commands above describe a fresh checkout.

`backend/requirements.lock.txt` records the exact installed package versions used for verification; `backend/requirements.txt` declares the supported direct dependency ranges. The lock was captured on macOS with Python 3.12; installation and tests must also be checked on the deployment platform.

Without an API key, the application clearly labels **Demo mode** and uses deterministic sample interpretation plus the same real planning calculations. Choose the optional sample wedding or create your own event. Nothing is seeded into your browser until you choose it.

## Enable Gemini

Set `GEMINI_API_KEY` and optionally `GEMINI_MODEL` in the root `.env`, then restart the backend. The key is read only by Python and is never sent to the frontend. Use a model available to your Gemini account that supports structured JSON output. The default is configured in `.env.example`.

Gemini interprets preferences, proposes concepts and tasks, extracts requested changes, explains computed tradeoffs, and compares user-entered vendor options. Pydantic validates model responses, and application code owns all financial calculations, dependency checks and database writes. A failed live request returns a retryable error; it does not pretend demo behavior was live AI.

Official references: [Google Gen AI Python SDK](https://github.com/googleapis/python-genai), [Gemini structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output). See [AI usage](docs/ai-usage.md) for the prompt/data boundary and validation details.

## Configuration

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Server-side credential; empty enables demo mode |
| `GEMINI_MODEL` | Configurable Gemini model supporting structured output |
| `DATABASE_URL` | SQLAlchemy URL; SQLite by default, `postgresql+psycopg://…` supported |
| `ALLOWED_ORIGINS` | Comma-separated explicit trusted frontend origins; no wildcard |
| `COOKIE_SECURE` | `false` for localhost HTTP; `true` behind production HTTPS (automatically enforced on Render) |
| `STATIC_DIR` | Built frontend path served by FastAPI; Docker configures this automatically |

Do not commit `.env`, databases, cookies or credentials. `.env.example` contains only placeholders.

## Architecture and calculations

- `frontend/src`: React, TypeScript, Vite, Tailwind plus application CSS. Forms, workspace views and proposal review use the same API.
- `backend/app/schemas.py`: validated API inputs and record types.
- `backend/app/planning.py`: deterministic budget calculations, dependencies, baseline planning and revision impacts.
- `backend/app/ai.py`: official Google Gen AI SDK, structured generation, conservative demo parser and safe error handling.
- `backend/app/database.py`: SQLAlchemy records for owned events, proposals and historical snapshots.
- `backend/app/main.py`: API/session/security boundary and orchestration.

An event snapshot stores its preferences, budget items, tasks/dependencies and vendor records together. Atomic compare-and-swap updates to the versioned SQLAlchemy event row keep a revision and its history consistent. JSON snapshots are deliberate for this small MVP, not a separate document service.

Money is integer **paise**. A per-person estimate is multiplied by the current guest count; fixed estimates are not. For each expense, use the committed total if recorded, otherwise the quote, otherwise the estimate. The projection is the greater of this forecast (including any explicitly estimated uncovered guests) and actual spending to date. These stages are **never added together**. A zero amount is a valid recorded amount.

A recorded per-person quote/commitment is never scaled or overwritten. If its guest coverage is known, extra guests beyond that coverage create explicit estimated exposure. If coverage is unknown, the plan flags that uncertainty. The reserve is 10% of total budget, rounded down to an integer paise and separately held. Remaining = budget − projected spending − reserve; negative remaining is reported as a shortfall. Initial estimates are illustrative allocations from the user's budget, not asserted local market prices.

Completed task dates stay unchanged in date revisions. Incomplete deadlines move with the event date. Dependencies are validated against the event and cycles rejected; overdue or incorrectly ordered tasks carry reasons. A date change never confirms vendor availability.

Vendor comparison does not commit an expense or book anyone. Transfer a chosen quote into Budget explicitly. Quoted base amount, taxes and additional charges are shown together in comparison; availability and booking status are only what you record.

## Persistence, ownership and concurrency

A high-entropy anonymous HttpOnly cookie identifies the browser; the database stores its hash. Every event and child-record route checks ownership and returns 404 for inaccessible IDs. SameSite cookies, explicit trusted-origin validation and deliberate CORS configuration protect browser mutations. Requests are limited to 128 KiB and a 10-second upload deadline, including chunked bodies. Nonempty API bodies require a JSON content type, and fields have explicit bounds. AI endpoints share rolling limits of 12 requests per browser per minute, 120 per browser per hour and 30 per source IP per minute. The source IP is the address visible to the application; trusted proxy handling must be configured for the deployment.

All event writes also share limits of 60 per browser and 180 per IP per minute, checked before reading the upload. Event reads are limited to 240 per browser and 600 per IP per minute; health probes remain available. Rate-limit tracking has a hard 10,000-key ceiling and rejects new traffic at capacity without evicting active limits. At most four Gemini requests run concurrently per server event loop. Blocking database operations run in worker threads, with only model coroutines scheduled on the shared server loop. Database connections are released while waiting for AI, and proposal writes recheck and lock the event to avoid saving previews for changed or deleted plans. No-op edits create no additional version or history snapshot; history listings select metadata only. Workspace listings select six summary fields in SQL, and the frontend retains only the active full plan. Planning transformations make one defensive copy of nested data rather than copying the task graph repeatedly. Concurrent creations serialize their final count/write within the single worker to enforce the 30-event limit.

The production frontend has a same-origin Content Security Policy (inline styles remain enabled for progress charts), frame blocking, and restrictive browser permissions. HTTPS deployments with `COOKIE_SECURE=true` send HSTS. Render automatically enforces secure cookies and HSTS and disables the interactive API documentation, even if the cookie setting is omitted. API responses are not cached; hashed build assets use immutable caching and HTML revalidates. Health probes and static files do not issue session cookies. The frontend cancels superseded reads, rejects older response versions, and blocks duplicate submissions before a second write starts.

Clearing cookies loses access to that anonymous browser's events. There is no account recovery or cross-device login in this MVP. Do not clear cookies if you want to resume your plans.

Proposal generation changes no saved event fields. Apply checks the base version and updates the event plus history atomically; stale proposals return 409. Apply retries are idempotent. Discard only changes proposal state. Restoring explicitly replaces the whole saved event snapshot, including financial/task/vendor records, and records the restoration in history. A version check protects against concurrent edits.

## Checks

```bash
cd backend
.venv/bin/python -m pytest -q
cd ../frontend
npm run build
npx playwright install chromium
npx playwright test
```

For a CI backend outside `.venv`, set `GATHERLY_BACKEND_COMMAND='python -m uvicorn app.main:app --app-dir ../backend --host 127.0.0.1 --port 8000'`. E2E tests create their own session; use an isolated test database and an empty Gemini key to avoid external requests.

See [verification](docs/verification.md) for what actually passed in the development environment and what remains untested.

## Deploy

The multi-stage Docker build bundles the compiled frontend with FastAPI. No separate JavaScript server is needed in production.

```bash
docker compose up --build -d
```

Open **http://localhost:8000**. The named `gatherly-data` volume persists SQLite. Stop containers without removing that volume to retain plans. `docker compose down -v` intentionally deletes it.

For HTTPS deployment on a container host:

1. Build and run the `Dockerfile`; expose port 8000 through your platform's HTTPS proxy.
2. Set `COOKIE_SECURE=true` and `ALLOWED_ORIGINS=https://YOUR_APP_HOST`.
3. Keep a persistent disk mounted at `/data` for SQLite, or set a managed PostgreSQL `DATABASE_URL` in the running container. The included Compose file fixes `DATABASE_URL` to its SQLite volume; edit that service environment entry to use PostgreSQL. Changing only the root `.env` database URL does not override the Compose entry. Back up the database.
4. Set the Gemini secret through the host's secret configuration. Keep it out of the image and repository.
5. Use one application worker for the MVP's process-local rate limiter. Shared rate limits and a database-backed event-creation quota lock are needed before scaling across workers/replicas. SQLite likewise suits a single instance; use PostgreSQL for multi-instance durability.
6. Check `/api/health`, then run the create/change/restore journey over HTTPS. Verify the cookie's Secure attribute and your allowed origin.

### Render

Create a **Web Service** from the repository using the **Docker** runtime. If the repository contains the outer `Event Planner` directory, set **Root Directory** to `gatherly`; if `Dockerfile` is already at the repository root, leave Root Directory blank. The Dockerfile builds the frontend and serves it with FastAPI on port 8000, so no separate static site or start command is needed. Set **Health Check Path** to `/api/health`.

Set these environment variables in Render's dashboard (do not upload `.env`):

| Name | Value |
| --- | --- |
| `GEMINI_API_KEY` | Your Gemini key, entered as a secret |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` |
| `COOKIE_SECURE` | `true` |
| `ALLOWED_ORIGINS` | The exact Render URL, for example `https://your-service.onrender.com` |
| `DATABASE_URL` | The internal connection URL from a Render Postgres database, if using Postgres |

Use Render Postgres for persistent plans. The backend accepts Render's `postgresql://` URL and converts it to the installed psycopg driver URL. Without `DATABASE_URL`, the Docker image uses SQLite at `/data/gatherly.db`; a free Render web service has no persistent disk, so plans disappear on restarts, redeploys and idle spin-downs. Render's free Postgres database also expires after 30 days, so choose a paid database if plans must last longer. A paid web service can alternatively mount a persistent disk at `/data` for SQLite. Render supplies HTTPS and can detect the image's exposed port 8000.

After deployment, visit `https://your-service.onrender.com/api/health` and confirm `{"status":"ok","ai_mode":"live"}`, then create a test event in the public UI. The local `.env` and local SQLite events do not transfer to Render.

Database tables are created on startup. Formal schema migrations, full account management and production observability are future work. This build prepares deployment artifacts; no production deployment or public submission URL is implied. Docker and PostgreSQL execution must be verified on the target host.

## Submission material

- [Requirements-to-features mapping](docs/requirements-mapping.md)
- [AI usage and safeguards](docs/ai-usage.md)
- [Truthful development prompt log](docs/development-prompt-log.md)
- [Demo walkthrough](docs/demo-walkthrough.md)
- [Draft LinkedIn post](docs/linkedin-submission-draft.md)
- [API contract](docs/api-contract.md)

### Reproducible resource and security checks

Run `backend/.venv/bin/python scripts/benchmark_planning.py` for deterministic CPU/peak-allocation measurements, and `backend/.venv/bin/python scripts/benchmark_workspace.py` for temporary SQLite workspace response measurements. Both use synthetic data without live AI. Results and methodology are in [the verification record](docs/verification.md). These measurements do not predict the challenge evaluator score.

GitHub Actions runs Bandit and Python/frontend dependency audits as well as the test suites. Scans report known issues, not a guarantee of security. Revision and proposal snapshots are retained until their event is deleted; long-running deployments still need storage monitoring and an explicit retention policy.
