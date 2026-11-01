import { useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Pencil,
  Users,
  CalendarDays,
  Wallet,
  Check,
  CheckCheck,
  Clock3,
  ChevronRight,
  Flower2,
  MapPin,
  Heart,
  ShieldCheck,
  AlertTriangle,
  SlidersHorizontal,
  History,
  RotateCcw,
  Store,
  GitCompareArrows,
  ClipboardList,
  Info,
} from "lucide-react";
import { Callout, EmptyState, SectionTitle, Tag, TextLink } from "./components";
import { InfoList } from "./assistant";
import { dateLabel, money, sentence } from "./api";
import {
  categories,
  categoryNames,
  type BudgetItem,
  type PlanningEvent,
  type Revision,
  type Task,
  type Vendor,
  type Comparison,
} from "./types";

export type View = "overview" | "budget" | "timeline" | "vendors" | "history";
export function Metrics({ event }: { event: PlanningEvent }) {
  const s = event.summary;
  return (
    <div className="metrics-grid">
      <div className="metric-card">
        <div className="metric-label">
          <Wallet size={16} />
          Total budget
        </div>
        <strong>{money(event.budget_paise)}</strong>
        <span className={s.overspend_paise ? "text-danger" : "text-green"}>
          {s.overspend_paise
            ? `${money(s.overspend_paise)} over, with reserve`
            : `${money(s.remaining_paise)} left after reserve`}
        </span>
      </div>
      <div className="metric-card">
        <div className="metric-label">
          <CalendarDays size={16} />
          The countdown
        </div>
        <strong>
          {Math.abs(s.days_remaining)} <small>days</small>
        </strong>
        <span>
          {s.days_remaining >= 0
            ? "until your celebration"
            : "since your celebration"}
        </span>
      </div>
      <div className="metric-card">
        <div className="metric-label">
          <Users size={16} />
          People to celebrate with
        </div>
        <strong>
          {event.guest_count.toLocaleString("en-IN")} <small>guests</small>
        </strong>
        <span>Every guest, thoughtfully included</span>
      </div>
      <div className="metric-card">
        <div className="metric-label">
          <CheckCheck size={16} />
          Making progress
        </div>
        <strong>
          {s.completed_tasks}
          <small> / {s.total_tasks} tasks</small>
        </strong>
        <div
          className="mini-progress"
          role="progressbar"
          aria-label="Tasks completed"
          aria-valuenow={s.completed_tasks}
          aria-valuemax={s.total_tasks || 1}
        >
          <span
            style={{
              width: `${s.total_tasks ? (s.completed_tasks / s.total_tasks) * 100 : 0}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
export function Overview({
  event,
  setView,
  onTask,
  onToggle,
  busy,
}: {
  event: PlanningEvent;
  setView: (view: View) => void;
  onTask: (t: Task) => void;
  onToggle: (t: Task) => void;
  busy: boolean;
}) {
  const next = [...event.tasks]
    .filter((t) => t.status !== "done")
    .sort(
      (a, b) =>
        Number(b.readiness === "ready") - Number(a.readiness === "ready") ||
        a.due_date.localeCompare(b.due_date),
    )
    .slice(0, 3);
  const s = event.summary;
  const used = Math.min(100, (s.projected_paise / event.budget_paise) * 100);
  const reserve = Math.min(
    Math.max(100 - used, 0),
    (s.reserve_paise / event.budget_paise) * 100,
  );
  return (
    <div className="overview-main">
      <section className="concept-card">
        <div className="concept-content">
          <div className="concept-kicker">
            <span className="tiny-flower">✳</span> THE CELEBRATION YOU’RE
            CREATING
          </div>
          <h2>
            A day full of meaning.
            <br />A plan with room to breathe.
          </h2>
          <p>{event.concept}</p>
          <div className="concept-tags">
            <span>
              <Heart size={13} />
              {event.atmosphere || event.occasion}
            </span>
            {event.theme && <span>{event.theme}</span>}
          </div>
        </div>
        <div className="celebration-art" aria-hidden="true">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-arch">
            <div className="arch-line" />
            <div className="art-table">
              <div className="vase" />
              <div className="stem stem-one" />
              <div className="stem stem-two" />
              <Flower2
                className="art-flower flower-one"
                size={42}
                strokeWidth={1.3}
              />
              <Flower2
                className="art-flower flower-two"
                size={33}
                strokeWidth={1.3}
              />
              <div className="art-candle candle-one" />
              <div className="art-candle candle-two" />
            </div>
          </div>
          <span className="art-spark spark-one">✧</span>
          <span className="art-spark spark-two">✳</span>
        </div>
      </section>
      <section className="panel budget-health">
        <SectionTitle title="A little clarity on the numbers">
          <TextLink onClick={() => setView("budget")}>View budget</TextLink>
        </SectionTitle>
        <div className="budget-health-numbers">
          <div>
            <span className="muted small">Projected expenses</span>
            <strong>
              {money(s.projected_paise)}{" "}
              <small>of {money(event.budget_paise)}</small>
            </strong>
          </div>
          <Tag tone={s.overspend_paise ? "coral" : "green"}>
            {s.overspend_paise ? "Needs a rethink" : "Room to breathe"}
          </Tag>
        </div>
        <div
          className="budget-progress"
          role="img"
          aria-label={`${money(s.projected_paise)} projected, ${money(s.reserve_paise)} contingency reserve, ${money(s.remaining_paise)} remaining`}
        >
          <div
            style={{ width: `${used}%` }}
            className={s.overspend_paise ? "over" : ""}
          />
          <div className="reserve" style={{ width: `${reserve}%` }} />
        </div>
        <div className="budget-legend">
          <span>
            <i className="legend-dot plum" />
            Projected <strong>{money(s.projected_paise)}</strong>
          </span>
          <span>
            <i className="legend-dot peach" />
            Reserve <strong>{money(s.reserve_paise)}</strong>
          </span>
          <span>
            <i className="legend-dot light" />
            Remaining <strong>{money(s.remaining_paise)}</strong>
          </span>
        </div>
        <p className="micro-note">
          Your 10% contingency is kept aside for the unexpected. Prices are
          illustrative estimates until you record a quote.
        </p>
      </section>
      <section className="panel next-steps">
        <SectionTitle
          eyebrow="ONE THING AT A TIME"
          title="Your next little steps"
        >
          <TextLink onClick={() => setView("timeline")}>All tasks</TextLink>
        </SectionTitle>
        {next.length ? (
          <div className="task-list">
            {next.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                onEdit={() => onTask(t)}
                onToggle={() => onToggle(t)}
                busy={busy}
                compact
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<CheckCheck />}
            title="A moment to enjoy the progress"
          >
            Every task is complete. Your celebration is coming together.
          </EmptyState>
        )}
      </section>
      <section className="panel details-panel">
        <SectionTitle title="The things that matter" />
        <div className="preference-block">
          <div className="preference-icon">
            <Heart size={17} />
          </div>
          <div>
            <h4>Your priorities, in order</h4>
            <div className="priority-chips">
              {event.priorities.map((p, i) => (
                <span key={p}>
                  <b>{i + 1}</b>
                  {categoryNames[p as keyof typeof categoryNames] ||
                    sentence(p)}
                </span>
              ))}
            </div>
          </div>
        </div>
        {event.non_negotiables.length > 0 && (
          <div className="preference-block">
            <div className="preference-icon">
              <ShieldCheck size={17} />
            </div>
            <div>
              <h4>Protected non-negotiables</h4>
              <p>{event.non_negotiables.join(" · ")}</p>
            </div>
          </div>
        )}
        <div className="preference-details">
          {[
            ["Dietary preferences", event.dietary_preferences],
            ["Accessibility", event.accessibility_needs],
            ["Cultural preferences", event.cultural_preferences],
          ]
            .filter(([, v]) => v)
            .map(([label, v]) => (
              <div key={label}>
                <span>{label}</span>
                <p>{v}</p>
              </div>
            ))}
        </div>
        <details className="plan-assumptions">
          <summary>
            <Info size={15} />
            How this plan was put together
          </summary>
          <InfoList title="Planning assumptions" items={event.assumptions} />
        </details>
      </section>
    </div>
  );
}
export function PlanningNotes({ event }: { event: PlanningEvent }) {
  return (
    <section className="planning-notes">
      <div className="notes-title">
        <span className="note-icon">
          <Flower2 size={18} />
        </span>
        <h3>A few things to keep in mind</h3>
      </div>
      {event.summary.overspend_paise > 0 && (
        <div className="note-item warning">
          <AlertTriangle size={16} />
          <p>
            The plan is {money(event.summary.overspend_paise)} over budget
            including reserve. Review unconfirmed choices before committing.
          </p>
        </div>
      )}
      {event.decisions.slice(0, 3).map((n, i) => (
        <div className="note-item" key={i}>
          <span className="note-number">{i + 1}</span>
          <p>{n}</p>
        </div>
      ))}
      {event.risks.slice(0, 2).map((n, i) => (
        <div className="note-item warning" key={i}>
          <AlertTriangle size={15} />
          <p>{n}</p>
        </div>
      ))}
      {!event.decisions.length && !event.risks.length && (
        <p className="muted">
          Your key details are in place. Keep confirming your vendor
          requirements as you go.
        </p>
      )}
    </section>
  );
}
export function BudgetView({
  event,
  onEdit,
  onAdd,
}: {
  event: PlanningEvent;
  onEdit: (i: BudgetItem) => void;
  onAdd: () => void;
}) {
  const s = event.summary;
  return (
    <div className="view-stack">
      <div className="view-intro">
        <div>
          <h2>Every rupee, with a purpose.</h2>
          <p>
            Estimates become quotes. Quotes become decisions. Keep each stage in
            view.
          </p>
        </div>
        <button className="button button-primary" onClick={onAdd}>
          <Plus size={17} />
          Add expense
        </button>
      </div>
      <div className="financial-summary">
        <div>
          <span>Projected total</span>
          <strong>{money(s.projected_paise)}</strong>
        </div>
        <div>
          <span>Contingency · 10%</span>
          <strong>{money(s.reserve_paise)}</strong>
        </div>
        <div>
          <span>Committed</span>
          <strong>{money(s.committed_paise)}</strong>
        </div>
        <div>
          <span>Paid to date</span>
          <strong>{money(s.actual_paise)}</strong>
        </div>
        <div
          className={s.overspend_paise ? "balance balance-negative" : "balance"}
        >
          <span>
            {s.overspend_paise
              ? "Over budget with reserve"
              : "Remaining after reserve"}
          </span>
          <strong>{money(s.overspend_paise || s.remaining_paise)}</strong>
        </div>
      </div>
      {s.overspend_paise > 0 && (
        <Callout tone="error">
          Your expenses plus reserve exceed the total budget by{" "}
          {money(s.overspend_paise)}. No expenses have been hidden or reduced to
          make the plan fit.
        </Callout>
      )}
      <section className="panel budget-table-panel">
        <div className="table-scroll">
          <table className="budget-table">
            <thead>
              <tr>
                <th>Expense</th>
                <th>Estimate</th>
                <th>Quoted total</th>
                <th>Committed</th>
                <th>Paid to date</th>
                <th>Projected</th>
                <th>
                  <span className="sr-only">Edit</span>
                </th>
              </tr>
            </thead>
            {categories
              .filter((c) => event.budget_items.some((i) => i.category === c))
              .map((c) => (
                <tbody key={c}>
                  <tr className="category-row">
                    <th colSpan={5}>
                      <span className={`category-marker category-${c}`} />
                      {categoryNames[c]}
                      <span className="category-count">
                        {
                          event.budget_items.filter((i) => i.category === c)
                            .length
                        }{" "}
                        items
                      </span>
                    </th>
                    <td>{money(s.category_totals[c] || 0)}</td>
                    <td />
                  </tr>
                  {event.budget_items
                    .filter((i) => i.category === c)
                    .map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.label}</strong>
                          <div className="budget-item-meta">
                            <span>
                              {item.cost_type === "per_person"
                                ? "Per guest"
                                : "Fixed cost"}
                            </span>
                            <Tag
                              tone={
                                item.source === "estimate" ? "warm" : "neutral"
                              }
                            >
                              {item.source === "estimate"
                                ? "Illustrative estimate"
                                : "Your entry"}
                            </Tag>
                          </div>
                          {item.notes && (
                            <p className="row-note">{item.notes}</p>
                          )}
                        </td>
                        <td>
                          {money(item.estimate_paise)}
                          {item.cost_type === "per_person" && (
                            <small>/ guest</small>
                          )}
                        </td>
                        <td>
                          {item.quoted_paise === null ? (
                            <span className="unset">—</span>
                          ) : (
                            money(item.quoted_paise)
                          )}
                        </td>
                        <td>
                          {item.committed_paise === null ? (
                            <span className="unset">—</span>
                          ) : (
                            money(item.committed_paise)
                          )}
                        </td>
                        <td>
                          {item.actual_paise === null ? (
                            <span className="unset">—</span>
                          ) : (
                            money(item.actual_paise)
                          )}
                        </td>
                        <td className="projected-cell">
                          <strong>{money(item.projected_paise)}</strong>
                          <small>{sentence(item.projection_basis)}</small>
                        </td>
                        <td>
                          <button
                            className="icon-button"
                            onClick={() => onEdit(item)}
                            aria-label={`Edit ${item.label}`}
                          >
                            <Pencil size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              ))}
          </table>
        </div>
        {!event.budget_items.length && (
          <EmptyState
            icon={<Wallet />}
            title="Give your budget its first detail"
            action={
              <button className="button button-secondary" onClick={onAdd}>
                <Plus size={16} />
                Add expense
              </button>
            }
          >
            Add fixed or per-guest expenses to start tracking your plan.
          </EmptyState>
        )}
      </section>
      <div className="formula-note">
        <Info size={18} />
        <div>
          <h4>A projection you can trace</h4>
          <p>
            For each expense, we use the committed total, otherwise the quoted
            total, otherwise the estimate. The projection is never lower than
            actual spending paid to date. These stages are not added together.
            Per-guest estimates scale with guest count; confirmed totals stay
            unchanged, with separate estimated exposure for uncovered guests.
            Remaining = budget − projected expenses − 10% contingency reserve.
          </p>
        </div>
      </div>
    </div>
  );
}
export function TaskRow({
  task,
  onEdit,
  onToggle,
  busy,
  compact = false,
}: {
  task: Task;
  onEdit: () => void;
  onToggle: () => void;
  busy: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`task-row ${task.status === "done" ? "task-done" : ""}`}>
      <button
        className={`task-check ${task.status === "done" ? "checked" : ""}`}
        aria-label={`${task.status === "done" ? "Reopen" : "Complete"} task: ${task.title}`}
        onClick={onToggle}
        disabled={busy}
        aria-pressed={task.status === "done"}
      >
        {task.status === "done" && <Check size={15} />}
      </button>
      <div className="task-main">
        <button className="task-title" onClick={onEdit}>
          {task.title}
        </button>
        <div className="task-meta">
          <span>
            <CalendarDays size={12} />
            {dateLabel(task.due_date, true)}
          </span>
          <span className={`priority-dot priority-${task.priority}`}>
            {sentence(task.priority)} priority
          </span>
          {!compact && <span>{sentence(task.status)}</span>}
        </div>
        {task.reasons.length > 0 && (
          <p
            className={`task-reason ${task.readiness === "at_risk" ? "text-danger" : ""}`}
          >
            {task.reasons.join(" · ")}
          </p>
        )}
      </div>
      <Tag
        tone={
          task.readiness === "ready" || task.readiness === "done"
            ? "green"
            : task.readiness === "at_risk"
              ? "coral"
              : "warm"
        }
      >
        {task.readiness === "ready"
          ? "Ready to start"
          : sentence(task.readiness)}
      </Tag>
      <button
        className="icon-button"
        onClick={onEdit}
        aria-label={`Edit task: ${task.title}`}
      >
        <ChevronRight size={17} />
      </button>
    </div>
  );
}
export function TimelineView({
  event,
  onEdit,
  onAdd,
  onToggle,
  busy,
}: {
  event: PlanningEvent;
  onEdit: (t: Task) => void;
  onAdd: () => void;
  onToggle: (t: Task) => void;
  busy: boolean;
}) {
  const [filter, setFilter] = useState("all");
  const tasks = [...event.tasks]
    .filter(
      (t) =>
        filter === "all" ||
        (filter === "done" && t.status === "done") ||
        (filter === "ready" && t.readiness === "ready") ||
        (filter === "attention" &&
          ["blocked", "at_risk"].includes(t.readiness)),
    )
    .sort(
      (a, b) =>
        Number(a.status === "done") - Number(b.status === "done") ||
        a.due_date.localeCompare(b.due_date),
    );
  return (
    <div className="view-stack">
      <div className="view-intro">
        <div>
          <h2>Big days are made of little steps.</h2>
          <p>
            Start with what’s ready. Dependencies keep everything in the right
            order.
          </p>
        </div>
        <button className="button button-primary" onClick={onAdd}>
          <Plus size={17} />
          Add task
        </button>
      </div>
      <div className="timeline-banner">
        <div className="timeline-icon">
          <CalendarDays size={22} />
        </div>
        <div>
          <strong>{dateLabel(event.event_date)}</strong>
          <p>
            {event.occasion} in {event.city}
          </p>
        </div>
        <div className="timeline-progress">
          <span>
            {event.summary.completed_tasks} of {event.summary.total_tasks} steps
            complete
          </span>
          <div className="mini-progress">
            <span
              style={{
                width: `${event.summary.total_tasks ? (event.summary.completed_tasks / event.summary.total_tasks) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      </div>
      <div className="filter-tabs" aria-label="Filter tasks">
        {[
          ["all", "All tasks"],
          ["ready", "Ready to start"],
          ["attention", "Needs attention"],
          ["done", "Completed"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={filter === key ? "active" : ""}
            aria-pressed={filter === key}
          >
            {label}
            <span>
              {
                event.tasks.filter(
                  (t) =>
                    key === "all" ||
                    (key === "ready" && t.readiness === "ready") ||
                    (key === "attention" &&
                      ["blocked", "at_risk"].includes(t.readiness)) ||
                    (key === "done" && t.status === "done"),
                ).length
              }
            </span>
          </button>
        ))}
      </div>
      <section className="panel timeline-panel">
        {tasks.length ? (
          tasks.map((t) => (
            <div key={t.id} className="timeline-task">
              <TaskRow
                task={t}
                onEdit={() => onEdit(t)}
                onToggle={() => onToggle(t)}
                busy={busy}
              />
              {t.dependencies.length > 0 && (
                <div className="dependency-line">
                  <span>Depends on</span>
                  {t.dependencies.map((id) => {
                    const prerequisite = event.tasks.find((p) => p.id === id);
                    return prerequisite ? (
                      <button
                        key={id}
                        onClick={() => onEdit(prerequisite)}
                        className={
                          prerequisite.status === "done" ? "satisfied" : ""
                        }
                      >
                        {prerequisite.status === "done" ? (
                          <Check size={12} />
                        ) : (
                          <Clock3 size={12} />
                        )}{" "}
                        {prerequisite.title}
                      </button>
                    ) : null;
                  })}
                </div>
              )}
              {t.notes && <p className="task-notes">{t.notes}</p>}
            </div>
          ))
        ) : (
          <EmptyState
            icon={<ClipboardList />}
            title={
              filter === "all"
                ? "Your next step starts here"
                : "A little breathing room"
            }
            action={
              filter === "all" ? (
                <button className="button button-secondary" onClick={onAdd}>
                  Add your first task
                </button>
              ) : undefined
            }
          >
            {filter === "all"
              ? "Add a task and give it a date."
              : "There are no tasks in this view right now."}
          </EmptyState>
        )}
      </section>
      <div className="formula-note">
        <Info size={18} />
        <p>
          Ready means all prerequisites are complete. Blocked tasks wait for a
          prerequisite. Overdue tasks, overdue prerequisites and impossible
          sequences are marked at risk. Completing or rescheduling a task
          recalculates readiness automatically.
        </p>
      </div>
    </div>
  );
}
export function VendorsView({
  event,
  onEdit,
  onAdd,
  onCompare,
  busy,
}: {
  event: PlanningEvent;
  onEdit: (v: Vendor) => void;
  onAdd: () => void;
  onCompare: (ids: string[]) => void;
  busy: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
  return (
    <div className="view-stack">
      <div className="view-intro">
        <div>
          <h2>Find the people who get your vision.</h2>
          <p>
            Your shortlist, your quotations, and the questions worth asking.
          </p>
        </div>
        <button className="button button-primary" onClick={onAdd}>
          <Plus size={17} />
          Add vendor quote
        </button>
      </div>
      <div className="vendor-toolbar">
        <span>
          <Store size={16} />
          {event.vendors.length} vendor options{" "}
          <span className="toolbar-separator">·</span> {selected.length}{" "}
          selected
        </span>
        <button
          className="button button-secondary"
          disabled={selected.length < 2 || selected.length > 5 || busy}
          onClick={() => onCompare(selected)}
        >
          <GitCompareArrows size={16} />
          {busy ? "Comparing…" : "Compare selected quotes"}
        </button>
      </div>
      {selected.length > 5 && (
        <Callout>Choose up to five quotes for a focused comparison.</Callout>
      )}
      <div className="vendor-grid">
        {event.vendors.map((v) => (
          <article
            className={`vendor-card ${selected.includes(v.id) ? "vendor-selected" : ""}`}
            key={v.id}
          >
            <div className="vendor-card-top">
              <div className={`vendor-avatar category-${v.category}`}>
                <Store size={23} />
              </div>
              <label className="vendor-select">
                <input
                  type="checkbox"
                  checked={selected.includes(v.id)}
                  onChange={() => toggle(v.id)}
                  aria-label={`Select ${v.name} for comparison`}
                />
                <span className="sr-only">Select for comparison</span>
              </label>
            </div>
            <div className="vendor-heading">
              <span className="eyebrow">{categoryNames[v.category]}</span>
              <h3>{v.name}</h3>
            </div>
            <div className="vendor-amount">
              <strong>{money(v.quoted_paise)}</strong>
              <span>quoted before taxes & extras</span>
            </div>
            <div className="vendor-status">
              <Tag tone={v.sample ? "warm" : "neutral"}>
                {v.sample ? "Illustrative sample quote" : "Your quote"}
              </Tag>
              <Tag tone={v.booking_status === "booked" ? "green" : "neutral"}>
                {sentence(v.booking_status)}
              </Tag>
            </div>
            <dl className="vendor-facts">
              <div>
                <dt>Guests covered</dt>
                <dd>{v.guests_covered ?? "Not specified"}</dd>
              </div>
              <div>
                <dt>Total with taxes & extras</dt>
                <dd>
                  {v.total_paise === undefined ? "—" : money(v.total_paise)}
                </dd>
              </div>
              <div>
                <dt>Taxes / extra charges</dt>
                <dd>
                  {money(v.taxes_paise)} / {money(v.additional_charges_paise)}
                </dd>
              </div>
              <div>
                <dt>Availability</dt>
                <dd
                  className={
                    v.availability === "unavailable" ? "text-danger" : ""
                  }
                >
                  {v.availability === "unknown"
                    ? "Not confirmed"
                    : `${sentence(v.availability)} · you recorded`}
                </dd>
              </div>
            </dl>
            <div className="vendor-inclusions">
              <h4>What’s included</h4>
              <p>{v.inclusions || "Ask the vendor for a detailed scope."}</p>
            </div>
            <button className="vendor-edit" onClick={() => onEdit(v)}>
              View & edit quote
              <ArrowUpRight size={16} />
            </button>
          </article>
        ))}
      </div>
      {!event.vendors.length && (
        <section className="panel">
          <EmptyState
            icon={<Store size={27} />}
            title="The right people make all the difference."
            action={
              <button className="button button-secondary" onClick={onAdd}>
                <Plus size={16} />
                Add your first quote
              </button>
            }
          >
            Add the quotations you’ve collected. Then compare what’s included,
            what’s missing, and what needs a conversation.
          </EmptyState>
        </section>
      )}
      <div className="formula-note">
        <ShieldCheck size={18} />
        <p>
          All vendor details are entered by you. Sample quotes are illustrative.
          Adding or comparing vendors does not confirm availability, make a
          booking, or automatically change your budget.
        </p>
      </div>
      <section className="panel requirements-panel">
        <SectionTitle title="A thoughtful brief for your vendors" />
        <div className="vendor-brief">
          <div>
            <h4>The occasion</h4>
            <p>
              {event.occasion} · {dateLabel(event.event_date)} · {event.city}
              <br />
              {event.guest_count} guests · {event.atmosphere}
            </p>
          </div>
          <div>
            <h4>Ask before you commit</h4>
            <p>
              Confirm written inclusions, taxes, guest coverage, overtime,
              cancellation terms, and availability for your date.
            </p>
          </div>
          <div>
            <h4>Your must-haves</h4>
            <p>
              {[
                ...event.non_negotiables,
                event.dietary_preferences,
                event.accessibility_needs,
                event.cultural_preferences,
              ]
                .filter(Boolean)
                .join(" · ") ||
                "Record all requirements in writing before booking."}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
export function VendorComparison({
  vendors,
  result,
}: {
  vendors: Vendor[];
  result: Comparison;
}) {
  const rows: { label: string; get: (v: Vendor) => string }[] = [
    {
      label: "Total including taxes & extras",
      get: (v) =>
        v.total_paise === undefined
          ? "Reopen this quote to refresh"
          : money(v.total_paise),
    },
    { label: "Service", get: (v) => categoryNames[v.category] },
    {
      label: "Quoted total (before extras)",
      get: (v) => money(v.quoted_paise),
    },
    {
      label: "Guests covered",
      get: (v) => v.guests_covered?.toString() || "Not specified",
    },
    { label: "Taxes", get: (v) => money(v.taxes_paise) },
    {
      label: "Additional charges",
      get: (v) => money(v.additional_charges_paise),
    },
    { label: "Inclusions", get: (v) => v.inclusions || "Not provided" },
    { label: "Exclusions", get: (v) => v.exclusions || "Not provided" },
    { label: "Payment terms", get: (v) => v.payment_terms || "Not provided" },
    {
      label: "Availability",
      get: (v) =>
        v.availability === "unknown"
          ? "Not confirmed"
          : `${sentence(v.availability)} (recorded by you)`,
    },
    { label: "Booking status", get: (v) => sentence(v.booking_status) },
    { label: "Notes", get: (v) => v.notes || "None recorded" },
  ];
  return (
    <div className="proposal-content">
      <div className="comparison-summary">
        <SparkleLabel demo={result.ai_mode === "demo"} />
        <p>{result.summary}</p>
      </div>
      <div className="table-scroll">
        <table className="vendor-comparison">
          <thead>
            <tr>
              <th>Quote details</th>
              {vendors.map((v) => (
                <th key={v.id}>
                  {v.name}
                  {v.sample && <small>Illustrative sample quote</small>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th>{r.label}</th>
                {vendors.map((v) => (
                  <td key={v.id}>{r.get(v)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="proposal-columns">
        <InfoList title="Tradeoffs" items={result.tradeoffs} />
        <InfoList
          title="Questions to take to your vendors"
          items={result.questions}
        />
      </div>
      <Callout>
        Comparison is advisory. It does not select a quote, book a vendor, or
        change your saved budget.
      </Callout>
    </div>
  );
}
function SparkleLabel({ demo }: { demo: boolean }) {
  return (
    <Tag tone="warm">
      {demo ? "Deterministic demo comparison" : "AI comparison"}
    </Tag>
  );
}
export function HistoryView({
  event,
  revisions,
  onRestore,
  loading,
}: {
  event: PlanningEvent;
  revisions: Revision[];
  onRestore: (r: Revision) => void;
  loading: boolean;
}) {
  return (
    <div className="view-stack">
      <div className="view-intro">
        <div>
          <h2>Every version has its place.</h2>
          <p>Your saved planning history. Make a change with a way back.</p>
        </div>
        <Tag tone="green">Current version {event.version}</Tag>
      </div>
      <Callout>
        Restoring a version brings back its full saved snapshot: event details,
        budget amounts, tasks, and vendor records. Your current plan is saved in
        history first.
      </Callout>
      <section className="panel history-panel">
        {loading ? (
          <div className="empty-state">Loading saved versions…</div>
        ) : revisions.length ? (
          revisions.map((r, i) => (
            <div className="history-row" key={r.id}>
              <div className={`history-node ${i === 0 ? "latest" : ""}`}>
                <History size={17} />
              </div>
              <div className="history-info">
                <div>
                  <h3>{r.label}</h3>
                  {r.restored && <Tag tone="warm">Restored snapshot</Tag>}
                </div>
                <p>
                  {new Date(r.created_at).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  <span>· Version {r.version}</span>
                </p>
              </div>
              <button
                className="button button-secondary button-small"
                onClick={() => onRestore(r)}
              >
                <RotateCcw size={14} />
                Restore this version
              </button>
            </div>
          ))
        ) : (
          <EmptyState icon={<History />} title="The beginning of your story">
            Revisions will appear here as you make changes to your plan.
          </EmptyState>
        )}
      </section>
    </div>
  );
}
