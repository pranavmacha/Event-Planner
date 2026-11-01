import { useState, useId, type FormEvent } from "react";
import {
  Sparkles,
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  Users,
  IndianRupee,
  CalendarDays,
  AlertTriangle,
  Check,
  Loader2,
  Heart,
} from "lucide-react";
import { Callout, Modal, Tag } from "./components";
import { dateLabel, money, sentence } from "./api";
import { categoryNames, type PlanningEvent, type Proposal } from "./types";

export function Assistant({
  event,
  busy,
  onPreview,
  clarification,
  mode,
}: {
  event: PlanningEvent;
  mode: string;
  busy: boolean;
  onPreview: (message: string) => Promise<boolean>;
  clarification: string;
}) {
  const [message, setMessage] = useState("");
  const inputId = useId();
  const titleId = useId();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (message.trim()) await onPreview(message.trim());
  };
  const example = `We now have ${event.guest_count + 50} guests, our budget is ₹7 lakh, and the event is two weeks earlier. Keep food quality as the top priority.`;
  return (
    <section className="assistant-card" aria-labelledby={titleId}>
      <div className="assistant-top">
        <span className="assistant-icon">
          <Sparkles size={20} />
        </span>
        <Tag tone="white">
          {mode === "demo" ? "Demo assistant" : "Gemini assistant"}
        </Tag>
      </div>
      <p className="eyebrow">ROOM FOR A CHANGE OF PLANS</p>
      <h2 id={titleId}>
        Life happens.
        <br />
        Your plan can adapt.
      </h2>
      <p className="assistant-description">
        More guests? A new date? See what changes, before you commit.
      </p>
      <form onSubmit={submit}>
        <label htmlFor={inputId} className="assistant-label">
          Change my plan
        </label>
        <textarea
          id={inputId}
          maxLength={3000}
          required
          minLength={3}
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell me what’s changed…"
          disabled={busy}
        />
        <button
          type="button"
          className="example-prompt"
          disabled={busy}
          onClick={() => setMessage(example)}
        >
          <span>Try a guest, budget & date change</span>
          <ArrowUpRight size={15} />
        </button>
        {clarification && (
          <div className="assistant-clarification" role="status">
            {clarification}
          </div>
        )}
        <button
          type="submit"
          className="button assistant-submit"
          disabled={busy || !message.trim()}
        >
          {busy ? (
            <Loader2 size={17} className="spin" />
          ) : (
            <Sparkles size={16} />
          )}{" "}
          {busy ? "Working through the details…" : "Preview changes"}
          {!busy && <ArrowRight size={16} />}
        </button>
      </form>
      <div className="assistant-promise">
        <ShieldCheck size={16} />
        <span>Your plan stays put until you approve.</span>
      </div>
      {mode === "demo" && (
        <p className="demo-disclosure">
          Deterministic demo · real calculations.
          <br />
          No live AI request is made.
        </p>
      )}
    </section>
  );
}
export function ProposalReview({
  proposal,
  current,
  busy,
  onClose,
  onApply,
  onDiscard,
}: {
  proposal: Proposal;
  current: PlanningEvent;
  busy: boolean;
  onClose: () => void;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const { before, after } = proposal;
  const stale = current.version !== proposal.base_version;
  const changeRows = [
    {
      name: "Guest count",
      icon: <Users size={16} />,
      before: before.guest_count.toLocaleString("en-IN"),
      after: after.guest_count.toLocaleString("en-IN"),
    },
    {
      name: "Event date",
      icon: <CalendarDays size={16} />,
      before: dateLabel(before.event_date),
      after: dateLabel(after.event_date),
    },
    {
      name: "Total budget",
      icon: <IndianRupee size={16} />,
      before: money(before.budget_paise),
      after: money(after.budget_paise),
    },
    {
      name: "Projected expenses",
      icon: null,
      before: money(before.summary.projected_paise),
      after: money(after.summary.projected_paise),
    },
    {
      name: "Contingency reserve",
      icon: null,
      before: money(before.summary.reserve_paise),
      after: money(after.summary.reserve_paise),
    },
    {
      name: "Remaining after reserve",
      icon: null,
      before: money(before.summary.remaining_paise),
      after: money(after.summary.remaining_paise),
    },
  ];
  return (
    <Modal
      title="A change of plans, clearly laid out."
      subtitle="Nothing has changed yet. Review the impact, then decide what feels right."
      onClose={onClose}
      wide
      busy={busy}
    >
      <div className="proposal-content">
        <div className="proposal-request">
          <Sparkles size={19} />
          <div>
            <span className="eyebrow">YOUR REQUEST</span>
            <p>“{proposal.message}”</p>
          </div>
          <Tag tone={proposal.ai_mode === "demo" ? "warm" : "green"}>
            {proposal.ai_mode === "demo" ? "Demo proposal" : "AI proposal"}
          </Tag>
        </div>
        {stale && (
          <Callout tone="error">
            This proposal is out of date because the saved plan changed. Discard
            it and generate a fresh preview before applying.
          </Callout>
        )}
        {after.summary.overspend_paise > 0 && (
          <Callout tone="error">
            <strong>
              {money(after.summary.overspend_paise)} over your spending limit,
              including reserve.
            </strong>{" "}
            These constraints do not currently fit. The proposal keeps every
            expense visible; consider a larger budget or revise unconfirmed
            choices.
          </Callout>
        )}
        <div className="comparison-table-wrap">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>What changes</th>
                <th>Current plan</th>
                <th>Proposed plan</th>
              </tr>
            </thead>
            <tbody>
              {changeRows.map((r, i) => (
                <tr key={r.name} className={i === 5 ? "comparison-total" : ""}>
                  <th>
                    <span>
                      {r.icon}
                      {r.name}
                    </span>
                  </th>
                  <td>{r.before}</td>
                  <td className={r.before !== r.after ? "changed" : ""}>
                    {r.after}
                    {r.before !== r.after && <span className="change-dot" />}
                  </td>
                </tr>
              ))}
              <tr>
                <th>
                  <span>
                    <Heart size={16} />
                    Ranked priorities
                  </span>
                </th>
                <td>
                  {before.priorities
                    .map(
                      (p) =>
                        categoryNames[p as keyof typeof categoryNames] ||
                        sentence(p),
                    )
                    .join(" → ")}
                </td>
                <td>
                  {after.priorities
                    .map(
                      (p) =>
                        categoryNames[p as keyof typeof categoryNames] ||
                        sentence(p),
                    )
                    .join(" → ")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="proposal-section">
          <h3>Where the budget moves</h3>
          {proposal.category_impacts.length ? (
            <div className="impact-list">
              {proposal.category_impacts.map((i) => (
                <div className="impact-row" key={i.category}>
                  <div>
                    <strong>
                      {categoryNames[i.category] || sentence(i.category)}
                    </strong>
                    <p>{i.reason}</p>
                  </div>
                  <div className="impact-amount">
                    <span>{money(i.before_paise)}</span>
                    <ArrowRight size={14} />
                    <strong>{money(i.after_paise)}</strong>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No category costs change.</p>
          )}
        </div>
        <div className="proposal-section">
          <h3>
            Dates that need your attention{" "}
            <span className="count-pill">{proposal.task_impacts.length}</span>
          </h3>
          {proposal.task_impacts.length ? (
            <div className="impact-list">
              {proposal.task_impacts.map((i) => (
                <div className="impact-row" key={i.id}>
                  <div>
                    <strong>{i.title}</strong>
                    <p>{i.reason}</p>
                  </div>
                  <div className="impact-amount">
                    <span>{dateLabel(i.before_date, true)}</span>
                    <ArrowRight size={14} />
                    <strong>{dateLabel(i.after_date, true)}</strong>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No task deadlines change.</p>
          )}
        </div>
        <div className="proposal-columns">
          <InfoList title="Tradeoffs to consider" items={proposal.tradeoffs} />
          <InfoList
            title="Constraints & booking checks"
            items={proposal.warnings}
            warning
          />
        </div>
        <InfoList
          title="Assumptions & information still needed"
          items={proposal.assumptions}
        />
        <div className="protected-note">
          <ShieldCheck size={20} />
          <div>
            <strong>
              Your non-negotiables and confirmed expenses stay protected.
            </strong>
            <p>
              {after.non_negotiables.length
                ? after.non_negotiables.join(" · ")
                : "Recorded quotes, commitments and actual spending are preserved. Bookings are never cancelled automatically."}
            </p>
          </div>
        </div>
        <footer className="modal-actions proposal-actions">
          <button
            className="button button-ghost"
            onClick={onDiscard}
            disabled={busy}
          >
            Discard proposal
          </button>
          <button
            className="button button-primary"
            onClick={onApply}
            disabled={busy || stale}
          >
            {busy ? (
              <Loader2 size={17} className="spin" />
            ) : (
              <Check size={17} />
            )}
            Apply revised plan
          </button>
        </footer>
      </div>
    </Modal>
  );
}
export function InfoList({
  title,
  items,
  warning = false,
}: {
  title: string;
  items: string[];
  warning?: boolean;
}) {
  return (
    <section className={`info-list ${warning ? "info-list-warning" : ""}`}>
      <h3>
        {warning && <AlertTriangle size={16} />} {title}
      </h3>
      {items.length ? (
        <ul>
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">Nothing additional to flag.</p>
      )}
    </section>
  );
}
