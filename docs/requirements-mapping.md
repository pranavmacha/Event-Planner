# Challenge alignment

Gatherly targets Indian family celebrations. The central demonstration is a saved celebration whose guest count, budget and date change together.

| Challenge requirement | Implementation / location | How to review |
| --- | --- | --- |
| Brief → personalized plan | Three-step event wizard; Gemini adapter with explicit deterministic demo mode | Create your own wedding, birthday or anniversary |
| Indian event preferences | INR, locality, atmosphere/theme, ranked priorities, dietary/cultural/accessibility preferences and non-negotiables | Review wizard and generated concept |
| Actionable workspace | Overview, budget, tasks and timeline, vendors, revision history | Open optional sample wedding |
| Realistic budget | Server-side integer paise, separate estimates/quotes/commitments/actual spending, fixed and per-guest costs, 10% reserve | Edit expenses and check recalculated totals |
| Honest assumptions | Illustrative estimates and sample vendor records are labeled; recorded quotes are user data | Inspect budget and vendor cards |
| Dependencies and scheduling | Directed dependency validation, readiness, overdue/compressed timeline warnings | Finish a prerequisite; inspect dependent task |
| Vendor coordination | Manual detailed quotations, explicit availability/booking status, side-by-side comparison and questions | Add two catering options and compare |
| Change without restarting | Natural-language extraction → validated proposal → deterministic financial and schedule impacts → apply/discard | Run demo script |
| Protected constraints | Only explicitly extracted fields change; non-negotiables, recorded quotes and commitments survive proposals | Inspect before/after and unresolved warnings |
| Revision integrity | Atomic version compare-and-swap, idempotent apply, stale proposal rejection, versioned restoration | Automated API tests and history view |
| Meaningful generative AI | Preferences/concepts/tasks, change extraction, tradeoff explanation, quotation analysis | `docs/ai-usage.md` |
| Reliable no-key demo | Explicit demo badge, deterministic interpretation and real calculations | Run without `GEMINI_API_KEY` |
| Persistence and ownership | SQLAlchemy database; anonymous HttpOnly cookie with server-side ownership enforcement | Refresh; open fresh browser session |
| Accessibility and responsive UI | Labeled controls, visible focus, dialog keyboard handling and mobile layout | Desktop/mobile browser review |
| Deployment preparation | Multi-stage Docker image, persistent volume, PostgreSQL-ready database URL | `README.md`, `Dockerfile`, `compose.yaml` |
| Submission assets | Prompt log, AI usage, walkthrough and LinkedIn draft | `docs/` |

This is an MVP, not a marketplace. It does not contact vendors, verify vendor claims, take payments, or book anything. User-recorded status is the only source of vendor availability and booking assertions.
