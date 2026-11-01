import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Check,
  Plus,
  Users,
  Heart,
  CalendarDays,
  Sparkles,
} from "lucide-react";
import { Field, Modal, SubmitButton, Callout } from "./components";
import {
  categories,
  categoryNames,
  type BudgetItem,
  type EventInput,
  type PlanningEvent,
  type Task,
  type Vendor,
} from "./types";
import { currencyInput, paise } from "./api";

const value = (f: FormData, n: string) => String(f.get(n) || "").trim();
const optionalMoney = (f: FormData, n: string) =>
  f.get(n) === "" ? null : paise(f.get(n));
const defaultDate = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 4);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function Wizard({
  onClose,
  onCreate,
  busy,
}: {
  onClose: () => void;
  onCreate: (data: EventInput) => Promise<boolean>;
  busy: boolean;
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Record<string, string>>({
    name: "",
    occasion: "Wedding",
    city: "",
    event_date: defaultDate(),
    budget: "",
    guest_count: "",
    atmosphere: "Warm & intimate",
    theme: "",
    non_negotiables: "",
    dietary_preferences: "",
    accessibility_needs: "",
    cultural_preferences: "",
  });
  const [priorities, setPriorities] = useState([
    "food",
    "logistics",
    "venue",
    "decor",
    "photography",
  ]);
  const field = (name: string) => ({
    value: draft[name] || "",
    onChange: (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => setDraft({ ...draft, [name]: e.target.value }),
  });
  const next = async (e: FormEvent) => {
    e.preventDefault();
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    const success = await onCreate({
      name: draft.name,
      occasion: draft.occasion,
      city: draft.city,
      event_date: draft.event_date,
      budget_paise: Math.round(Number(draft.budget) * 100),
      guest_count: Number(draft.guest_count),
      atmosphere: draft.atmosphere,
      theme: draft.theme,
      priorities,
      non_negotiables: draft.non_negotiables
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean),
      dietary_preferences: draft.dietary_preferences,
      accessibility_needs: draft.accessibility_needs,
      cultural_preferences: draft.cultural_preferences,
    });
    if (success) onClose();
  };
  const reorder = (index: number, direction: number) => {
    const copy = [...priorities];
    [copy[index], copy[index + direction]] = [
      copy[index + direction],
      copy[index],
    ];
    setPriorities(copy);
  };
  return (
    <Modal
      title="Something worth celebrating."
      subtitle="A few details now. A plan you can keep making your own."
      onClose={onClose}
      busy={busy}
    >
      <div className="wizard-steps">
        {["The occasion", "The feeling", "What matters"].map((s, i) => (
          <div
            key={s}
            className={i === step ? "current" : i < step ? "complete" : ""}
          >
            <span>{i < step ? <Check size={13} /> : i + 1}</span>
            {s}
          </div>
        ))}
      </div>
      <form onSubmit={next} className="modal-form">
        {step === 0 && (
          <>
            <div className="form-section-intro">
              <CalendarDays size={20} />
              <span>Start with the essentials</span>
            </div>
            <div className="form-grid">
              <Field label="Event name" full>
                <input
                  autoFocus
                  required
                  maxLength={120}
                  placeholder="e.g. Ananya & Rohan’s wedding"
                  {...field("name")}
                />
              </Field>
              <Field label="Occasion">
                <select {...field("occasion")}>
                  {[
                    "Wedding",
                    "Birthday",
                    "Anniversary",
                    "Engagement",
                    "Family celebration",
                    "Other",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="City or locality">
                <input
                  required
                  maxLength={120}
                  placeholder="e.g. Bengaluru"
                  {...field("city")}
                />
              </Field>
              <Field label="Event date">
                <input required type="date" {...field("event_date")} />
              </Field>
              <Field label="Expected guests">
                <input
                  required
                  min="1"
                  max="100000"
                  type="number"
                  placeholder="200"
                  {...field("guest_count")}
                />
              </Field>
              <Field
                label="Total budget (₹)"
                hint="Your total spending limit. We’ll set aside a 10% contingency reserve."
                full
              >
                <input
                  required
                  min="1"
                  max="1000000000"
                  step="0.01"
                  type="number"
                  placeholder="800000"
                  {...field("budget")}
                />
              </Field>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <div className="form-section-intro">
              <Heart size={20} />
              <span>Make it feel like you</span>
            </div>
            <div className="form-grid">
              <Field label="Desired atmosphere" full>
                <div className="choice-grid">
                  {[
                    "Warm & intimate",
                    "Joyful & lively",
                    "Elegant & timeless",
                    "Relaxed & outdoors",
                  ].map((a) => (
                    <button
                      key={a}
                      type="button"
                      className={`choice ${draft.atmosphere === a ? "selected" : ""}`}
                      onClick={() => setDraft({ ...draft, atmosphere: a })}
                      aria-pressed={draft.atmosphere === a}
                    >
                      {a}
                      {draft.atmosphere === a && <Check size={15} />}
                    </button>
                  ))}
                </div>
              </Field>
              <Field
                label="Theme or inspiration"
                hint="Optional — colours, a favourite place, or a feeling."
                full
              >
                <input
                  maxLength={400}
                  placeholder="Marigolds, warm lights, and a little nostalgia"
                  {...field("theme")}
                />
              </Field>
              <Field
                label="Rank your priorities"
                hint="Move the things that matter most to the top. All costs stay visible."
                full
              >
                <div className="priority-list">
                  {priorities.map((p, i) => (
                    <div className="priority-row" key={p}>
                      <span className="priority-number">{i + 1}</span>
                      <span>
                        {categoryNames[p as keyof typeof categoryNames]}
                      </span>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Move ${categoryNames[p as keyof typeof categoryNames]} up`}
                        disabled={i === 0}
                        onClick={() => reorder(i, -1)}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Move ${categoryNames[p as keyof typeof categoryNames]} down`}
                        disabled={i === priorities.length - 1}
                        onClick={() => reorder(i, 1)}
                      >
                        <ArrowDown size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </Field>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div className="form-section-intro">
              <Users size={20} />
              <span>A celebration where everyone belongs</span>
            </div>
            <div className="form-grid">
              <Field
                label="Non-negotiable requirements"
                hint="One requirement per line. These are protected when your plan changes."
                full
              >
                <textarea
                  rows={3}
                  maxLength={3000}
                  placeholder="Step-free access for grandparents\nKeep food quality high"
                  {...field("non_negotiables")}
                />
              </Field>
              <Field label="Dietary preferences">
                <textarea
                  rows={2}
                  maxLength={1000}
                  placeholder="Vegetarian menu, nut allergies…"
                  {...field("dietary_preferences")}
                />
              </Field>
              <Field label="Accessibility needs">
                <textarea
                  rows={2}
                  maxLength={1000}
                  placeholder="Step-free venue, accessible toilets…"
                  {...field("accessibility_needs")}
                />
              </Field>
              <Field label="Cultural preferences" full>
                <textarea
                  rows={2}
                  maxLength={1000}
                  placeholder="Ceremonies, traditions, or timings to plan around"
                  {...field("cultural_preferences")}
                />
              </Field>
            </div>
            <Callout>
              Your first plan includes illustrative estimates. Add your own
              vendor quotes as you make decisions.
            </Callout>
          </>
        )}
        <footer className="modal-actions">
          <button
            className="button button-ghost"
            type="button"
            disabled={busy}
            onClick={() => (step > 0 ? setStep(step - 1) : onClose())}
          >
            {step > 0 ? <ArrowLeft size={16} /> : null}
            {step > 0 ? "Back" : "Cancel"}
          </button>
          <button
            className="button button-primary"
            type="submit"
            disabled={busy}
          >
            {step === 2 ? <Sparkles size={16} /> : null}
            {busy
              ? "Creating your plan…"
              : step === 2
                ? "Create my event"
                : "Continue"}
            {step < 2 && <ArrowRight size={16} />}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function BudgetForm({
  event,
  item,
  onClose,
  onSave,
  busy,
}: {
  event: PlanningEvent;
  item?: BudgetItem;
  onClose: () => void;
  onSave: (data: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [type, setType] = useState(item?.cost_type || "fixed");
  const [baseVersion] = useState(event.version);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await onSave({
      label: value(f, "label"),
      category: value(f, "category"),
      cost_type: type,
      estimate_paise: paise(f.get("estimate")),
      quoted_paise: optionalMoney(f, "quoted"),
      committed_paise: optionalMoney(f, "committed"),
      actual_paise: optionalMoney(f, "actual"),
      quote_guest_count: f.get("quote_guest_count")
        ? Number(f.get("quote_guest_count"))
        : null,
      source: "user",
      notes: value(f, "notes"),
      ...(item ? { expected_version: baseVersion } : {}),
    });
    if (ok) onClose();
  };
  return (
    <Modal
      title={item ? "Edit this expense" : "Add a budget item"}
      subtitle="Record each stage separately. Confirmed totals stay protected when guest counts change."
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} className="modal-form">
        <div className="form-grid">
          <Field label="Expense name" full>
            <input
              name="label"
              required
              maxLength={150}
              defaultValue={item?.label}
              placeholder="e.g. Wedding lunch"
            />
          </Field>
          <Field label="Category">
            <select name="category" defaultValue={item?.category || "food"}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {categoryNames[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cost structure">
            <select
              name="cost_type"
              value={type}
              onChange={(e) =>
                setType(e.target.value as "fixed" | "per_person")
              }
            >
              <option value="fixed">Fixed total</option>
              <option value="per_person">Per guest</option>
            </select>
          </Field>
          <Field
            label={
              type === "per_person"
                ? "Estimated price per guest (₹)"
                : "Estimated total (₹)"
            }
            hint="A planning estimate, not a confirmed price."
          >
            <input
              name="estimate"
              type="number"
              required
              min="0"
              max="1000000000"
              step="0.01"
              defaultValue={currencyInput(item?.estimate_paise ?? 0)}
            />
          </Field>
          <Field
            label="Quoted total (₹)"
            hint="Leave blank if there is no quote yet."
          >
            <input
              name="quoted"
              type="number"
              min="0"
              max="1000000000"
              step="0.01"
              defaultValue={currencyInput(item?.quoted_paise ?? null)}
              placeholder="Not quoted"
            />
          </Field>
          <Field label="Committed total (₹)">
            <input
              name="committed"
              type="number"
              min="0"
              max="1000000000"
              step="0.01"
              defaultValue={currencyInput(item?.committed_paise ?? null)}
              placeholder="Not committed"
            />
          </Field>
          <Field label="Paid to date (₹)">
            <input
              name="actual"
              type="number"
              min="0"
              max="1000000000"
              step="0.01"
              defaultValue={currencyInput(item?.actual_paise ?? null)}
              placeholder="Not spent"
            />
          </Field>
          <Field
            label="Guests covered by confirmed amount"
            full
            hint="For per-guest items, additional guests are shown as estimated exposure without changing your confirmed total."
          >
            <input
              name="quote_guest_count"
              type="number"
              min="1"
              max="100000"
              defaultValue={item?.quote_guest_count ?? ""}
              placeholder={`e.g. ${event.guest_count}`}
            />
          </Field>
          <Field label="Notes & assumptions" full>
            <textarea
              name="notes"
              rows={3}
              maxLength={2000}
              defaultValue={item?.notes}
            />
          </Field>
        </div>
        <Callout>
          Projection uses committed → quoted → estimated, and is never lower
          than spending paid to date. Stages are not added together. Zero is a
          valid confirmed amount.
        </Callout>
        <footer className="modal-actions">
          <button
            type="button"
            className="button button-ghost"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <SubmitButton busy={busy}>
            {item ? "Save expense" : "Add expense"}
          </SubmitButton>
        </footer>
      </form>
    </Modal>
  );
}
export function TaskForm({
  event,
  task,
  onClose,
  onSave,
  busy,
}: {
  event: PlanningEvent;
  task?: Task;
  onClose: () => void;
  onSave: (data: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [baseVersion] = useState(event.version);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await onSave({
      title: value(f, "title"),
      due_date: value(f, "due_date"),
      priority: value(f, "priority"),
      status: value(f, "status"),
      dependencies: f.getAll("dependencies"),
      notes: value(f, "notes"),
      ...(task ? { expected_version: baseVersion } : {}),
    });
    if (ok) onClose();
  };
  return (
    <Modal
      title={task ? "Edit task" : "One step closer"}
      subtitle="Give your plan a clear next action."
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} className="modal-form">
        <div className="form-grid">
          <Field label="Task title" full>
            <input
              name="title"
              required
              maxLength={200}
              defaultValue={task?.title}
              placeholder="e.g. Schedule the menu tasting"
            />
          </Field>
          <Field label="Due date">
            <input
              name="due_date"
              type="date"
              required
              defaultValue={task?.due_date || event.event_date}
            />
          </Field>
          <Field label="Priority">
            <select name="priority" defaultValue={task?.priority || "medium"}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </Field>
          <Field label="Status" full>
            <select name="status" defaultValue={task?.status || "todo"}>
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
            </select>
          </Field>
          <Field
            label="Depends on"
            hint="This task is blocked until its prerequisites are complete."
            full
          >
            <div className="dependencies">
              {event.tasks.filter((t) => t.id !== task?.id).length ? (
                event.tasks
                  .filter((t) => t.id !== task?.id)
                  .map((t) => (
                    <label key={t.id} className="check-label">
                      <input
                        type="checkbox"
                        name="dependencies"
                        value={t.id}
                        defaultChecked={task?.dependencies.includes(t.id)}
                      />
                      <span>{t.title}</span>
                    </label>
                  ))
              ) : (
                <span className="muted">No other tasks yet.</span>
              )}
            </div>
          </Field>
          <Field label="Notes" full>
            <textarea
              name="notes"
              rows={3}
              maxLength={2000}
              defaultValue={task?.notes}
            />
          </Field>
        </div>
        <footer className="modal-actions">
          <button
            type="button"
            className="button button-ghost"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <SubmitButton busy={busy}>
            {task ? "Save task" : "Add task"}
          </SubmitButton>
        </footer>
      </form>
    </Modal>
  );
}
export function VendorForm({
  vendor,
  version,
  onClose,
  onSave,
  busy,
}: {
  vendor?: Vendor;
  version: number;
  onClose: () => void;
  onSave: (data: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [baseVersion] = useState(version);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await onSave({
      name: value(f, "name"),
      category: value(f, "category"),
      quoted_paise: paise(f.get("quoted")),
      guests_covered: f.get("guests_covered")
        ? Number(f.get("guests_covered"))
        : null,
      inclusions: value(f, "inclusions"),
      exclusions: value(f, "exclusions"),
      taxes_paise: paise(f.get("taxes")),
      additional_charges_paise: paise(f.get("additional")),
      payment_terms: value(f, "payment_terms"),
      availability: value(f, "availability"),
      booking_status: value(f, "booking_status"),
      sample: vendor?.sample ?? false,
      notes: value(f, "notes"),
      ...(vendor ? { expected_version: baseVersion } : {}),
    });
    if (ok) onClose();
  };
  return (
    <Modal
      title={vendor ? "Edit vendor quote" : "Add a vendor quote"}
      subtitle="Keep the details together. Availability and booking status are recorded by you."
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} className="modal-form">
        <div className="form-grid">
          <Field label="Vendor name" full>
            <input
              name="name"
              required
              maxLength={150}
              placeholder="e.g. Marigold Catering"
              defaultValue={vendor?.name}
            />
          </Field>
          <Field label="Service category">
            <select name="category" defaultValue={vendor?.category || "food"}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {categoryNames[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quoted total, before taxes (₹)">
            <input
              name="quoted"
              type="number"
              required
              min="0"
              max="1000000000"
              step="0.01"
              defaultValue={vendor ? currencyInput(vendor.quoted_paise) : ""}
              placeholder="180000"
            />
          </Field>
          <Field label="Guests covered">
            <input
              name="guests_covered"
              type="number"
              min="1"
              max="100000"
              defaultValue={vendor?.guests_covered ?? ""}
              placeholder="If applicable"
            />
          </Field>
          <Field label="Taxes (₹)">
            <input
              name="taxes"
              type="number"
              required
              min="0"
              max="1000000000"
              step="0.01"
              defaultValue={currencyInput(vendor?.taxes_paise ?? 0)}
            />
          </Field>
          <Field label="Additional charges (₹)">
            <input
              name="additional"
              type="number"
              required
              min="0"
              max="1000000000"
              step="0.01"
              defaultValue={currencyInput(
                vendor?.additional_charges_paise ?? 0,
              )}
            />
          </Field>
          <Field label="Availability">
            <select
              name="availability"
              defaultValue={vendor?.availability || "unknown"}
            >
              <option value="unknown">Not yet confirmed</option>
              <option value="available">Confirmed available by me</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </Field>
          <Field label="Inclusions">
            <textarea
              name="inclusions"
              rows={3}
              maxLength={2000}
              defaultValue={vendor?.inclusions}
              placeholder="Menu, service staff, crockery…"
            />
          </Field>
          <Field label="Exclusions">
            <textarea
              name="exclusions"
              rows={3}
              maxLength={2000}
              defaultValue={vendor?.exclusions}
              placeholder="Transport, overtime, special menu…"
            />
          </Field>
          <Field label="Payment terms" full>
            <input
              name="payment_terms"
              maxLength={1000}
              defaultValue={vendor?.payment_terms}
              placeholder="e.g. 25% deposit, balance after the event"
            />
          </Field>
          <Field label="Booking status" full>
            <select
              name="booking_status"
              defaultValue={vendor?.booking_status || "considering"}
            >
              <option value="considering">Considering</option>
              <option value="contacted">Contacted by me</option>
              <option value="booked">Booked by me</option>
            </select>
          </Field>
          <Field label="Notes" full>
            <textarea
              name="notes"
              rows={2}
              maxLength={2000}
              defaultValue={vendor?.notes}
            />
          </Field>
        </div>
        <Callout>
          Adding a quote keeps it in your vendor shortlist. Record a selected
          quote in Budget when you choose it; comparisons do not change your
          costs.
        </Callout>
        <footer className="modal-actions">
          <button
            type="button"
            className="button button-ghost"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <SubmitButton busy={busy}>
            {vendor ? "Save quote" : "Add quote"}
          </SubmitButton>
        </footer>
      </form>
    </Modal>
  );
}
