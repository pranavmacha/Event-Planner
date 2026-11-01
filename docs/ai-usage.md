# AI usage and safeguards

Gatherly uses AI to interpret preferences and explain choices, while application code owns costs, dates, dependencies and saved records. The integration is in `backend/app/ai.py`.

## Where generative AI adds value

| Workflow | Gemini contribution | Application responsibility |
| --- | --- | --- |
| Create an event | A concept reflecting atmosphere, theme, priorities and family requirements; useful tasks, open decisions and risks | Baseline budget allocation, reserve, task dates, dependency validation and persistence |
| Change my plan | Extract explicitly requested guests, budget, date and priority changes into a bounded schema | Validate changes, preserve recorded expenses/non-negotiables, calculate impacts, present a proposal, atomically apply or discard |
| Explain a revision | Explain priorities, tradeoffs and unresolved vendor or scheduling constraints | Supply calculated before/after figures and ensure overspend warnings cannot be omitted |
| Compare quotations | Explain differences in scope, coverage, payment terms and suitability; identify missing information | Calculate quotation totals, validate selected vendor IDs and enforce ownership |

No model-generated number is used as a confirmed market quote. Vendor availability and booking status come only from records the organizer enters. The assistant cannot contact or book vendors.

## Enabling live Gemini

Install `backend/requirements.txt`, then set these **server-side** variables in the project `.env`:

```dotenv
GEMINI_API_KEY=your-real-key
GEMINI_MODEL=gemini-3.1-flash-lite
```

Restart the backend. `GET /api/health` reports `ai_mode: "live"` when a nonempty key is configured. This reports configuration, not proof that the key/model can successfully complete requests. Choose a supported model available to your Google project; the model name is configurable. The default is pinned to Gemini 3.1 Flash-Lite for responsive structured output.

The frontend receives neither the key nor an SDK client. Do not put the key into a `VITE_` variable, source control, browser code or a public hosting environment. With no key, the application clearly uses demo mode. A live API failure never switches silently to demo.

## Prompt structure and response validation

Each request contains a fixed system instruction, a workflow-specific instruction, a Pydantic JSON Schema and an `UNTRUSTED_DATA_JSON` payload. The payload contains an allowlisted event context and, where relevant, the user's request, recorded vendor quotations or application-calculated revision impacts. Session cookies and ownership data are excluded.

The system instruction treats event descriptions, user messages and vendor text as untrusted data, requires preservation of non-negotiables and recorded expenses, prohibits invented prices/statuses and provides no execution or external action tools. Automatic function calling is explicitly disabled. Prompt instructions are defense in depth; schemas, calculation code and explicit proposal acceptance enforce the real boundary.

The implementation uses the official `google-genai` Python SDK's asynchronous `client.models.generate_content` interface, `response_mime_type="application/json"`, and `response_json_schema=Schema.model_json_schema()`. Every response then passes `model_validate_json`. Schemas forbid extra fields and coercion, bound text/list sizes and amounts, validate calendar dates and restrict task priority values. Only guest count, budget, date and priorities are accepted in a proposed change. The backend validates these again before calculation and persistence.

One ambiguous or unsupported part causes a clarification for the entire change request; no partial set of changes is proposed. Relative dates use the saved event date, not today's date. A lower budget changes budget headroom and reserve; it does not silently reduce costs to produce a balanced plan.

## Deterministic demo mode

Demo behavior is a template and conservative parser, not a simulated successful model request. It generates concepts/tasks from the organizer's actual saved preferences and compares manually entered quotation totals and gaps. Budget and timeline calculations use the same application code as live mode.

Supported change examples include:

- `250 guests instead of 200, budget ₹7 lakh instead of ₹8 lakh, event two weeks earlier. Keep food quality as the top priority.`
- `Change guests from 200 to 250 and budget from ₹8 lakh to ₹7 lakh.`
- `Guest count: 230, budget is INR 7.25 lakh.`
- `Move the event to 2027-02-01.`
- `Move the event three days later. Prioritize photography.`

Demo mode accepts INR amounts with commas or lakh/crore units, ISO dates, whole days/weeks earlier/later and one top-priority change. It deliberately requests clarification for unknown phrasing, competing values, unsupported changes or requests to alter protected records. This is a smaller language surface than live Gemini.

## Failures, retries and review

Requests have a 25-second transport timeout and a 28-second coroutine bound. SDK retries are limited to one attempt; application code may retry once for malformed output, timeouts or transient server errors. Quota/auth/model errors are not blindly retried. Provider exception details are not returned to users or logged by this integration, avoiding accidental disclosure of request URLs or credentials.

Failures return a safe `AIError` for the backend to expose as HTTP 503. Existing work remains saved; the user can retry. Proposal request IDs and atomic version checks are enforced by the persistence layer, so a retry cannot apply a change twice. Text explanations are advice and can be mistaken; the before/after figures and explicit Apply/Discard controls remain the source of truth.

## Verification and sources

`backend/tests/test_ai.py` covers old/new amount extraction, the exact flagship request, relative-date arithmetic across a leap-year boundary, conservative clarification, preference-based demo output, preserved inputs, quotation totals/omissions, strict output validation and mocked SDK success/failure behavior. Mock tests do not prove external API availability. No authenticated live Gemini request was completed during this implementation; enabling a real key and testing the selected model remains a deployment check.

Official documentation consulted during development:

- [Google Gemini Generate Content structured output documentation](https://ai.google.dev/gemini-api/docs/generate-content/structured-output): JSON Schema configuration and Pydantic response validation. Google labels this documented endpoint as Generate Content (Legacy).
- [Official Google Gen AI Python SDK](https://github.com/googleapis/python-genai): client construction, asynchronous calls and context management, JSON Schema support and model configuration.

The implementation uses the documented Generate Content API instead of introducing an additional interaction/session abstraction. No external tools or model-managed conversation persistence are needed for these bounded requests.
