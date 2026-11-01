# Verification record

Verified locally on 1 November 2026 (Asia/Kolkata), using Python 3.12.16, Node 24.18.0, SQLite and Chromium via Playwright. The environment had no Gemini API key.

## Final results

| Check | Observed result |
| --- | --- |
| `cd backend && .venv/bin/python -m pytest -q` | **76 passed** in 1.38 seconds |
| `cd frontend && npm run build` | TypeScript and Vite production build passed |
| `cd frontend && npx playwright test` | **3 passed** in 5.2 seconds |
| Python installed dependency consistency | `pip check`: no broken requirements |
| npm dependency audit | 0 reported vulnerabilities at installation/final frontend audit |
| Production FastAPI serving | Built HTML, JavaScript and CSS returned HTTP 200; unknown API route returned JSON 404 |
| Rendered inspection | In-app browser review of welcome, sample overview and revision preview; screenshot inspection of desktop overview and before/after preview |

### Automated acceptance journey

The Chromium test performs the following through the UI, then uses the same browser's API session for exact state assertions:

1. Create a custom wedding through all wizard steps: ₹8,00,000, 200 guests, future date, theme, dietary and accessibility needs, protected requirements.
2. Edit catering estimates and a confirmed quote/commitment; finish the guest-list prerequisite and verify the venue task becomes ready.
3. Enter two catering quotations, select them and open side-by-side comparison.
4. Submit the exact example requesting 250 guests, ₹7 lakh and a date two weeks earlier.
5. Assert exact proposed amounts, unchanged confirmed costs, ₹90,000 additional catering exposure at ₹1,800 × 50 guests, unchanged fixed expenses, reserve/remaining formula, moved unfinished deadlines and preserved completed-task dates.
6. Discard and compare the full saved event to its pre-proposal state: unchanged.
7. Generate again, apply, refresh, and verify the new version/guests/budget persisted with protected requirements and vendors intact.
8. Restore the previous full snapshot and verify expenses, tasks, vendors, date and preferences.
9. Open a second isolated browser context: empty event list and HTTP 404 when attempting to read or apply a proposal to the first browser's event.

The mobile test uses a 390 × 844 viewport and checks usable navigation and absence of page overflow on both Overview and Budget. The third test runs Axe WCAG 2 A/AA and 2.1 A/AA checks on the setup dialog and Overview with reduced motion enabled; no violations were reported in those scanned states. This is a targeted automated accessibility check, not a full accessibility certification.

### Backend coverage

Tests exercise fixed/per-person arithmetic, stage precedence and paid-to-date floors, zero amounts, extra-guest exposure, reserve rounding, exact-number bounds, dependency cycles/unknown IDs/readiness, the API journey, proposal idempotency/discard/apply/restore, stale edits, concurrent writes, persistence after restart, all event/child ownership routes, hashed cookie ownership, origins, body limits, rate limits, date overflow, and timestamp offsets. AI tests exercise deterministic parsing and preference behavior plus mocked official SDK schemas/retries/quota/malformed-response handling.

The final backend run emitted one third-party Starlette TestClient deprecation warning about its httpx transport. It did not affect test results. Browser tooling emitted a terminal color environment warning only.

## Issues discovered and fixed

- Deposits could understate projection under a simple “actual first” rule; the forecast now stays at least the larger commitment/quote/estimate while tracking paid amounts separately.
- Demo parsing was hardened for old/new budgets, no-space lakh units, and negative numeric tokens.
- Extreme money/date inputs now return validation errors instead of losing integer precision or causing server errors.
- SQLite revision timestamps include explicit UTC offsets for correct local display.
- A toast intercepted a vendor form submit button; notification text no longer intercepts pointer events.
- A screen-reader table label escaped the mobile scroll container and enlarged the page; its containing block is now explicit.
- Small text contrast was strengthened. Accessibility scans wait for stable presentation by using the app's reduced-motion support.

## External limits

- **Live Gemini follow-up:** after the initial no-key verification, the user configured a server-side key. Structured-output requests to `gemini-3.1-flash-lite` passed using synthetic data. A live `POST /api/events` returned 201 with a concept, budget and tasks; the synthetic event was then deleted. The complete multi-step planning journey remains verified in demo mode.
- **Docker unexecuted:** Docker is not installed here. The multi-stage Dockerfile/Compose configuration was reviewed, and the corresponding built frontend was served successfully by the real FastAPI process.
- **PostgreSQL untested:** SQLAlchemy/psycopg configuration is provided, but no PostgreSQL service was available. SQLite persistence and concurrency were exercised.
- **No production deployment:** no hosting URL or challenge/social submission was created. LinkedIn submission links remain placeholders.
- Rate limiting is process-local and the anonymous session has no cross-device recovery. Keep the MVP to one application worker; add shared rate limiting and a migration strategy before scaling.

Screenshots: `docs/screenshots/overview.png` and `docs/screenshots/revision-preview.png`. They show synthetic test event/vendor data, not real vendor offerings.

## Live connection follow-up

The initial live extraction check passed with `gemini-3.8-flash`, but the user's full plan request timed out. A repeat with synthetic plan data hit the same provider timeout. The saved local model was changed to `gemini-3.1-flash-lite`; a synthetic full plan completed in 4.6 seconds, and the real running API created a synthetic event in live mode with 7 budget items and 15 tasks. That event was deleted after verification. Only synthetic test data was used for follow-up checks. No key value was printed or added to this document.

## Security and efficiency follow-up

- Backend: **98 tests passed** in 1.59 seconds. Added regressions for database connections released during AI calls, deletion/change during preview generation, metadata-only history reads, no-op edits, bounded/thread-safe rate limits, request concurrency/cancellation, minimized AI context, secure headers, session-cookie isolation and asset caching.
- Frontend: TypeScript/Vite production build passed. The full **7-test browser suite passed**, covering the original journey/accessibility/mobile checks plus stale reads, event-switch races, unavailable browser storage and duplicate submissions. One additional production-build test passed, confirming that the compiled site creates a plan under its Content Security Policy with no policy violations or JavaScript errors (**8 browser checks total**).
- A deliberately large synthetic 200-task case decreased from 5,561,792 bytes of enriched task JSON to 1,260,682 bytes (about 77% smaller) by bounding repeated dependency explanations. All prerequisite IDs and readiness checks remain intact. This is a stress fixture, not a production traffic benchmark.
- A synthetic extraction fixture with over 160 KB of unrelated task data now sends less than 2 KB of relevant JSON to the mocked AI boundary.
- `npm audit` reported zero known vulnerabilities. `pip-audit` checked all 44 pinned Python dependencies, skipped none, and found no known vulnerabilities; the scanner ran in a temporary environment without changing project dependencies. These changes do not migrate the database or remove existing history. Existing PostgreSQL/deployment limits above still apply; no live model calls or remote deployment were performed in this follow-up.

## Measured resource improvements after evaluator feedback

The user reported that the updated GitHub repository scored efficiency 80→80, security 84→84 and code quality 86→88. The evaluator supplied no detailed findings in this conversation. The following measurements demonstrate specific improvements; they do not predict a new evaluator percentage.

Planning measurements compare commit `efc827d` with the current implementation, using Python 3.12.16 on the same local machine. The synthetic fixture contains 200 budget items, 200 tasks, 100 vendors and 8,725 dependency edges (678 KB of enriched JSON). Each timing is the median of seven batches of 50 operations, without tracing enabled. Memory is the median incremental peak of seven separately traced operations; input allocation is excluded. It is **not total process RAM**.

| Operation | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Event recalculation time | 4.334 ms | 2.588 ms | 40% |
| Event recalculation peak Python allocation | 576,457 bytes | 408,490 bytes | 29% |
| Plan revision time | 6.392 ms | 2.646 ms | 59% |
| Plan revision peak Python allocation | 907,435 bytes | 437,929 bytes | 52% |

The implementation copies nested inputs once, reuses that owned copy throughout calculation, and combines budget projection/aggregation into one pass. Input immutability and day-dependent readiness remain covered. A differential check of 100 seeded dense-plan cases matched the previous implementation for both recalculation and revisions.

A separate temporary SQLite benchmark seeded 30 synthetic plans at those record limits. It compares the legacy full-list endpoint with the new summary-list endpoint plus one selected full plan, both on the current backend. Timing is the median of five batches of three reads through TestClient; it includes request handling and serialization but excludes real-network latency and browser rendering. Tracing runs separately. Switching events now makes a detail request instead of retaining all full plans in browser state; this adds a round trip while reducing the initial transfer and retained data.

| Workspace read | All 30 full plans | Summaries + selected plan |
| --- | ---: | ---: |
| Response bytes | 18,828,891 | 631,459 (97% less) |
| Median request time | 311.077 ms | 22.372 ms (93% less) |
| Peak Python allocations | 86,832,383 bytes | 3,008,444 bytes (97% less) |

Reproduce from the repository root:

```sh
backend/.venv/bin/python scripts/benchmark_planning.py
backend/.venv/bin/python scripts/benchmark_workspace.py
```

To reproduce the planning baseline, export `backend/app/planning.py` from `efc827d` to a temporary file and pass that path to `benchmark_planning.py --planning-module PATH`. These scripts use synthetic data, do not call Gemini and do not touch saved user events. Performance varies with hardware and dataset size; these are stress fixtures, not a production traffic study.

Additional changes and validation:

- **117 backend tests passed** in 2.07 seconds; `pip check` passed. New checks prove that blocked SQL work leaves the server loop responsive for all four AI routes, connections remain released during AI, concurrent creations respect the 30-event quota, and summary reads preserve ownership without enriching full plans.
- Production frontend build passed; **11 browser tests passed**, including initial selective loading, changing selection during a delayed fetch, failed-detail retry, the existing planning journey, accessibility, mobile, stale-read protection and production CSP checks.
- Uploads now have a 10-second deadline, enforce the byte limit on chunked bodies, require JSON media types for nonempty bodies, and check write limits before consuming the upload. Event reads have separate rate limits. Tests cover timeout, oversize, unsupported media type, early rejection and health-probe availability.
- Render automatically enforces Secure cookies/HSTS and disables interactive documentation/OpenAPI. Detection uses Render's documented `RENDER=true` environment variable ([Render documentation](https://render.com/docs/environment-variables)). Local HTTP remains supported. Blocking database work runs in FastAPI workers; AI calls return to the shared server loop through [AnyIO's worker-thread bridge](https://anyio.readthedocs.io/en/stable/threads.html#calling-asynchronous-code-from-a-worker-thread).
- Bandit reports zero findings with no suppressions; Python and frontend dependency audits report no known vulnerabilities. GitHub Actions now runs these scans on pushes and PRs with read-only repository permissions. This is targeted testing and automated scanning, not a comprehensive penetration test.
- Creation quota locks and rate limits remain process-local: the deployment still requires one worker. Revision/proposal snapshots are retained until their event is deleted; ongoing storage monitoring and an explicit retention policy remain necessary for long-lived deployments. No saved data was deleted, no live AI calls were made, and no push or deployment was performed during this pass. Temporary test servers were stopped.
