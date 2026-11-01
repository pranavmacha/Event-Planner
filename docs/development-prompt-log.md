# Development prompt log

This log records work actually requested in this Codex session. It is not a reconstruction of imaginary earlier iterations.

## 1. User brief — 1 November 2026

The user supplied a pasted specification for **Google Prompt Wars Virtual Challenge 5: Celebration and Event Planner**, naming the application **Gatherly**. It required a working React/TypeScript/Vite/Tailwind frontend, FastAPI/Pydantic/SQLAlchemy backend, Gemini integration, accurate deterministic planning, secure anonymous ownership, and the full create → track → revise → restore journey. The specification also required these submission documents and truthful verification reporting.

## 2. Initial implementation decisions

The existing workspace was inspected and was empty. No applicable repository `AGENTS.md` or useful existing application was found. The implementation was placed in the `gatherly` subdirectory. The Sites skill was read; its Worker hosting runtime does not run the requested Python backend, so the deliverable uses the requested stack with Docker deployment preparation instead of claiming a Sites deployment.

An API contract was written before parallel implementation. Amounts are integer paise, IDs opaque, dates ISO calendar dates, and each event has an optimistic concurrency version. A later clarification made actual spending “paid to date,” so a deposit cannot replace a larger committed expense in the projected cost.

## 3. Actual parallel work assignments

- **Backend:** implement persistence, ownership, deterministic costs/dependencies, CRUD, proposals, atomic apply/discard/restore, and meaningful automated tests. Preserve quoted/committed amounts and label uncovered-guest exposure.
- **Frontend:** implement the full planning workspace, accessible event setup, budget/task/vendor editors, assistant revision preview, and restoration using the shared API contract. Use ivory, plum and coral with responsive navigation.
- **AI integration:** use official `google-genai` and Pydantic structured responses, deterministic no-key behavior, safe parsing of old/new change requests, meaningful quote analysis, safe failures, and AI-specific tests. Consult current official documentation.
- **Integration:** prepare deployment files and submission documents, inspect the rendered application, run automated checks and the central workflow, and fix observed integration issues.

## 4. Observed fixes during integration

Backend tests and review caught old/new budget parsing whitespace, no-space currency units, negative numeric tokens, exact-number bounds, date overflow and SQLite timezone serialization. These were fixed with regression tests. Projected spending was clarified so paid deposits do not erase larger commitments.

The first Chromium journey reached vendor entry but found a success toast intercepting the submit button; a concurrent frontend hot reload also detached the form. The initial mobile budget check found page overflow, later traced to an absolutely positioned screen-reader label outside its scroll container. The UI was adjusted and the affected checks rerun. Success notifications are hidden while a dialog is open so they do not obscure revision figures. A targeted accessibility check was added after small secondary text was observed to need stronger contrast.

## 5. Verification record

See `verification.md` for completed checks, observed results and limits. Live Gemini calls and production deployment are not claimed unless explicitly verified there. The absence of a key is handled by labeled deterministic demo mode.

No credentials, hidden model reasoning, or fabricated challenge submission URLs are included in this log.
