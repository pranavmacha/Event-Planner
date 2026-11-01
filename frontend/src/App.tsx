import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Wallet,
  CalendarDays,
  Store,
  History,
  Plus,
  ChevronDown,
  MapPin,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Check,
  X,
  AlertCircle,
  Loader2,
  Flower2,
  Menu,
  ArrowUpRight,
  RotateCcw,
} from "lucide-react";
import { api, ApiError, dateLabel } from "./api";
import { Logo, Modal, Spinner, Tag, Callout } from "./components";
import { Wizard, BudgetForm, TaskForm, VendorForm } from "./forms";
import { Assistant, ProposalReview } from "./assistant";
import {
  Metrics,
  Overview,
  PlanningNotes,
  BudgetView,
  TimelineView,
  VendorsView,
  VendorComparison,
  HistoryView,
  type View,
} from "./views";
import type {
  BudgetItem,
  Comparison,
  EventInput,
  PlanningEvent,
  Proposal,
  Revision,
  Task,
  Vendor,
} from "./types";

type Editor =
  | { kind: "budget"; item?: BudgetItem }
  | { kind: "task"; item?: Task }
  | { kind: "vendor"; item?: Vendor }
  | null;
const navigation = [
  { id: "overview" as View, label: "Overview", icon: LayoutDashboard },
  { id: "budget" as View, label: "Budget", icon: Wallet },
  { id: "timeline" as View, label: "Tasks & timeline", icon: CalendarDays },
  { id: "vendors" as View, label: "Vendors", icon: Store },
  { id: "history" as View, label: "Plan history", icon: History },
];
function rememberEvent(id: string) {
  try {
    localStorage.setItem("gatherly.activeEvent", id);
  } catch {
    // Browser storage is optional; a successful server save must remain successful.
  }
}
function rememberedEvent() {
  try {
    return localStorage.getItem("gatherly.activeEvent");
  } catch {
    return null;
  }
}
export default function App() {
  const [events, setEvents] = useState<PlanningEvent[]>([]);
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mode, setMode] = useState("demo");
  const [view, setView] = useState<View>("overview");
  const [wizard, setWizard] = useState(false);
  const [editor, setEditor] = useState<Editor>(null);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
    null,
  );
  const [mobileNav, setMobileNav] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [clarification, setClarification] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [comparison, setComparison] = useState<{
    result: Comparison;
    ids: string[];
  } | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [restore, setRestore] = useState<Revision | null>(null);
  const operationPending = useRef(false);
  const workspaceRequest = useRef<AbortController | null>(null);
  const pendingRequest = useRef<{
    eventId: string;
    message: string;
    id: string;
  } | null>(null);
  const event = events.find((e) => e.id === activeId);
  const isBusy = !!busy;
  const modalIsOpen = Boolean(
    wizard || editor || assistantOpen || proposalOpen || comparison || restore,
  );
  const adopt = useCallback((updated: PlanningEvent, select = true) => {
    setEvents((list) => {
      const existing = list.find((e) => e.id === updated.id);
      // A read started before a save may finish after it. Never roll the UI back.
      if (existing && existing.version > updated.version) return list;
      return existing
        ? list.map((e) => (e.id === updated.id ? updated : e))
        : [updated, ...list];
    });
    if (select) {
      setActiveId(updated.id);
      rememberEvent(updated.id);
    }
  }, []);
  const load = useCallback(async () => {
    workspaceRequest.current?.abort();
    const controller = new AbortController();
    workspaceRequest.current = controller;
    setLoading(true);
    setLoadError("");
    try {
      const [list, health] = await Promise.all([
        api<PlanningEvent[]>("/events", "GET", undefined, {
          signal: controller.signal,
        }),
        api<{ ai_mode: string }>("/health", "GET", undefined, {
          signal: controller.signal,
        }),
      ]);
      if (controller.signal.aborted) return;
      setEvents(list);
      setMode(health.ai_mode);
      const saved = rememberedEvent();
      setActiveId(
        list.some((e) => e.id === saved) ? saved! : list[0]?.id || "",
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not load your workspace.",
      );
    } finally {
      if (workspaceRequest.current === controller) {
        workspaceRequest.current = null;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
  }, []);
  useEffect(() => {
    void load();
    return () => workspaceRequest.current?.abort();
  }, [load]);
  useEffect(() => {
    if (!toast || toast.error) return;
    const timer = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!event || view !== "history") return;
    const controller = new AbortController();
    setHistoryLoading(true);
    api<Revision[]>(`/events/${event.id}/revisions`, "GET", undefined, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!controller.signal.aborted) setRevisions(r);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setToast({ text: e.message, error: true });
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });
    return () => controller.abort();
  }, [event?.id, event?.version, view]);
  useEffect(() => {
    let controller: AbortController | null = null;
    let lastRefresh = 0;
    const refresh = () => {
      if (
        !activeId ||
        operationPending.current ||
        controller ||
        Date.now() - lastRefresh < 5000
      )
        return;
      lastRefresh = Date.now();
      const request = new AbortController();
      controller = request;
      void api<PlanningEvent>(`/events/${activeId}`, "GET", undefined, {
        signal: request.signal,
      })
        .then((updated) => {
          if (!request.signal.aborted) adopt(updated, false);
        })
        .catch(() => {})
        .finally(() => {
          controller = null;
        });
    };
    window.addEventListener("focus", refresh);
    return () => {
      controller?.abort();
      window.removeEventListener("focus", refresh);
    };
  }, [activeId, adopt]);
  const beginOperation = (label: string) => {
    // A ref locks immediately, including two submissions before React re-renders.
    if (operationPending.current) return false;
    operationPending.current = true;
    setBusy(label);
    return true;
  };
  const endOperation = () => {
    operationPending.current = false;
    setBusy("");
  };
  const report = (error: unknown) => {
    setToast({
      text:
        error instanceof Error
          ? error.message
          : "Something went wrong. Your saved plan is safe; please try again.",
      error: true,
    });
    if (error instanceof ApiError && error.status === 409 && event)
      void api<PlanningEvent>(`/events/${event.id}`)
        .then((updated) => adopt(updated, false))
        .catch(() => {});
  };
  const save = async (
    path: string,
    method: string,
    data: unknown,
    success: string,
  ) => {
    if (!beginOperation("saving")) return false;
    try {
      const updated = await api<PlanningEvent>(path, method, data);
      adopt(updated);
      setToast({ text: success });
      return true;
    } catch (error) {
      report(error);
      return false;
    } finally {
      endOperation();
    }
  };
  const create = async (data: EventInput) => {
    const ok = await save(
      "/events",
      "POST",
      data,
      "Your celebration has a plan. Let’s make it yours.",
    );
    if (ok) {
      setView("overview");
      setProposal(null);
      setClarification("");
    }
    return ok;
  };
  const sample = async () => {
    if (!beginOperation("sample")) return;
    try {
      const created = await api<PlanningEvent>("/events/sample", "POST", {});
      adopt(created);
      setView("overview");
      setToast({
        text: "Sample wedding added. All sample prices are illustrative estimates.",
      });
    } catch (error) {
      report(error);
    } finally {
      endOperation();
    }
  };
  const toggleTask = async (task: Task) => {
    if (!event) return;
    await save(
      `/events/${event.id}/tasks/${task.id}`,
      "PATCH",
      {
        status: task.status === "done" ? "todo" : "done",
        expected_version: event.version,
      },
      task.status === "done"
        ? "Task reopened. Readiness has been updated."
        : "One step closer. Task completed and dependencies updated.",
    );
  };
  const preview = async (message: string) => {
    if (!event || !beginOperation("proposal")) return false;
    setClarification("");
    if (
      pendingRequest.current?.message !== message ||
      pendingRequest.current?.eventId !== event.id
    )
      pendingRequest.current = {
        eventId: event.id,
        message,
        id: crypto.randomUUID(),
      };
    try {
      const result = await api<
        Proposal | { clarification: string; ai_mode: string }
      >(`/events/${event.id}/proposals`, "POST", {
        message,
        request_id: pendingRequest.current.id,
      });
      pendingRequest.current = null;
      if ("clarification" in result) {
        setClarification(result.clarification);
        return false;
      }
      setProposal(result);
      setProposalOpen(true);
      setAssistantOpen(false);
      return true;
    } catch (error) {
      report(error);
      return false;
    } finally {
      endOperation();
    }
  };
  const apply = async () => {
    if (!event || !proposal) return;
    const ok = await save(
      `/events/${event.id}/proposals/${proposal.id}/apply`,
      "POST",
      {},
      "Revised plan applied. Your previous version is saved in Plan history.",
    );
    if (ok) {
      setProposal(null);
      setProposalOpen(false);
      setClarification("");
    }
  };
  const discard = async () => {
    if (!event || !proposal || !beginOperation("discard")) return;
    try {
      await api(
        `/events/${event.id}/proposals/${proposal.id}/discard`,
        "POST",
        {},
      );
      setProposal(null);
      setProposalOpen(false);
      setToast({
        text: "Proposal discarded. Your saved plan has not changed.",
      });
    } catch (error) {
      report(error);
    } finally {
      endOperation();
    }
  };
  const compare = async (ids: string[]) => {
    if (!event || !beginOperation("compare")) return;
    try {
      const result = await api<Comparison>(
        `/events/${event.id}/vendors/compare`,
        "POST",
        { vendor_ids: ids },
      );
      setComparison({ result, ids });
    } catch (error) {
      report(error);
    } finally {
      endOperation();
    }
  };
  const restoreVersion = async () => {
    if (!restore || !event) return;
    const ok = await save(
      `/events/${event.id}/revisions/${restore.id}/restore`,
      "POST",
      { expected_version: event.version },
      "Previous plan restored. The plan you left is also saved in history.",
    );
    if (ok) setRestore(null);
  };
  const switchEvent = (id: string) => {
    if (operationPending.current) return;
    setActiveId(id);
    rememberEvent(id);
    setView("overview");
    setProposal(null);
    setProposalOpen(false);
    setClarification("");
    setMobileNav(false);
    setComparison(null);
    setEditor(null);
    setRestore(null);
    setAssistantOpen(false);
  };
  const navigate = (v: View) => {
    setView(v);
    setMobileNav(false);
  };
  return (
    <div className="app-shell">
      <a href="#workspace" className="skip-link">
        Skip to your workspace
      </a>
      <aside
        id="main-sidebar"
        className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}
      >
        <div className="sidebar-top">
          <Logo />
          <button
            className="icon-button mobile-nav-close"
            aria-label="Close navigation"
            onClick={() => setMobileNav(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="sidebar-event">
          <span className="eyebrow">YOUR CELEBRATIONS</span>
          {events.length > 0 ? (
            <div className="event-switcher">
              <span className="event-mini-icon">
                <Flower2 size={17} />
              </span>
              <select
                aria-label="Switch event"
                value={activeId}
                onChange={(e) => switchEvent(e.target.value)}
                disabled={isBusy}
              >
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </div>
          ) : (
            <p className="sidebar-empty">A little space for your big day.</p>
          )}
          <button
            className="new-event-button"
            onClick={() => setWizard(true)}
            disabled={isBusy || loading}
          >
            <Plus size={16} />
            New event
          </button>
        </div>
        <nav aria-label="Main navigation">
          <span className="eyebrow nav-eyebrow">THE PLAN</span>
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              disabled={!event}
              onClick={() => navigate(id)}
              className={`nav-item ${view === id ? "active" : ""}`}
              aria-current={view === id ? "page" : undefined}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "timeline" && !!event && (
                <span className="nav-count">
                  {event.summary.total_tasks - event.summary.completed_tasks}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Flower2 size={27} strokeWidth={1.2} />
            <p>
              For the moments
              <br />
              that bring us together.
            </p>
            <span>Planned with a little more care.</span>
          </div>
          <div className="session-note">
            <span className="session-avatar">Y</span>
            <div>
              <strong>Your private workspace</strong>
              <span>Saved in this browser’s session</span>
            </div>
            <ShieldCheck size={15} />
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="nav-overlay"
          aria-label="Close navigation overlay"
          onClick={() => setMobileNav(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              aria-expanded={mobileNav}
              aria-controls="main-sidebar"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
            <span>Your workspace</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{navigation.find((n) => n.id === view)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="saved-label">
              <span /> {isBusy ? "Working on it…" : "Saved with care"}
            </span>
            <Tag tone={mode === "demo" ? "warm" : "green"}>
              {mode === "demo" ? "Demo mode" : "Live AI"}
            </Tag>
          </div>
        </header>
        <main id="workspace" className="workspace">
          {loading ? (
            <Spinner label="Finding your celebrations…" />
          ) : loadError ? (
            <div className="load-error panel">
              <AlertCircle size={30} />
              <h1>Your workspace needs a moment.</h1>
              <p>{loadError}</p>
              <button
                className="button button-primary"
                onClick={() => void load()}
              >
                Try again
              </button>
              <p className="muted small">
                For local development, start the API server on port 8000 and
                reload.
              </p>
            </div>
          ) : !event ? (
            <div className="welcome">
              <div className="welcome-heading">
                <p className="eyebrow">A LITTLE MORE TOGETHER</p>
                <h1>
                  Good things start
                  <br />
                  with getting together.
                </h1>
                <p>
                  Bring your celebration to life with a thoughtful budget,
                  <br className="desktop-break" /> a clear timeline, and a plan
                  that can grow with you.
                </p>
              </div>
              <div className="welcome-grid">
                <section className="welcome-create">
                  <span className="welcome-flower">
                    <Flower2 size={52} strokeWidth={1.3} />
                  </span>
                  <div>
                    <p className="eyebrow">YOUR NEXT BEAUTIFUL MOMENT</p>
                    <h2>What are we celebrating?</h2>
                    <p>
                      A wedding, a birthday, or a milestone that deserves
                      everyone around the table.
                    </p>
                    <button
                      className="button button-primary"
                      onClick={() => setWizard(true)}
                      disabled={isBusy}
                    >
                      <Plus size={17} />
                      Create an event
                      <ArrowRight size={17} />
                    </button>
                  </div>
                  <div className="welcome-arch" aria-hidden="true">
                    <span>✳</span>
                  </div>
                </section>
                <section className="welcome-sample">
                  <span className="eyebrow">TAKE A LITTLE LOOK AROUND</span>
                  <h2>
                    A wedding,
                    <br />
                    already taking shape.
                  </h2>
                  <p>
                    Explore a sample celebration with 200 guests, an ₹8 lakh
                    budget, and an accessible venue requirement.
                  </p>
                  <div className="sample-details">
                    <span>
                      <UsersIcon />
                      200 guests
                    </span>
                    <span>
                      <CalendarDays size={15} />
                      Four months away
                    </span>
                  </div>
                  <button
                    className="button button-secondary"
                    onClick={() => void sample()}
                    disabled={isBusy}
                  >
                    {busy === "sample" ? (
                      <Loader2 size={16} className="spin" />
                    ) : (
                      <ArrowUpRight size={16} />
                    )}
                    Explore sample wedding
                  </button>
                  <p className="micro-note">
                    Optional sample · illustrative quotes and estimates.
                  </p>
                </section>
              </div>
              <div className="welcome-benefits">
                <div>
                  <Wallet size={20} />
                  <strong>A budget that adds up</strong>
                  <p>Know what’s estimated, confirmed, and still possible.</p>
                </div>
                <div>
                  <CalendarDays size={20} />
                  <strong>Your next step, made clear</strong>
                  <p>Keep deadlines, decisions, and dependencies in sight.</p>
                </div>
                <div>
                  <Sparkles size={20} />
                  <strong>Room for life’s changes</strong>
                  <p>Preview the impact of a change before you apply it.</p>
                </div>
              </div>
              <div className="welcome-footnote">
                <ShieldCheck size={15} />
                Your plans are saved privately in this browser session.
                {mode === "demo" && (
                  <span>
                    {" "}
                    Demo mode uses deterministic planning, with real
                    calculations.
                  </span>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="event-heading">
                <div>
                  <p className="eyebrow">
                    {view === "overview"
                      ? "YOUR CELEBRATION, COMING TOGETHER"
                      : `${event.name} · YOUR PLANNING WORKSPACE`}
                  </p>
                  <h1>
                    {view === "overview"
                      ? event.name
                      : navigation.find((n) => n.id === view)?.label}
                  </h1>
                  <div className="event-meta">
                    <span>
                      <CalendarDays size={15} />
                      {dateLabel(event.event_date)}
                    </span>
                    <i />
                    <span>
                      <MapPin size={15} />
                      {event.city}
                    </span>
                    <i />
                    <span>{event.occasion}</span>
                  </div>
                </div>
                <button
                  className="button button-secondary change-plan-button"
                  onClick={() => setAssistantOpen(true)}
                  disabled={isBusy}
                >
                  <Sparkles size={17} />
                  Change my plan
                </button>
              </div>
              {proposal && !proposalOpen && (
                <div className="pending-proposal">
                  <Sparkles size={17} />
                  <span>
                    You have a proposed revision to review.
                    {proposal.base_version !== event.version
                      ? " The saved plan has changed since this preview."
                      : ""}
                  </span>
                  <button
                    className="text-link"
                    onClick={() => setProposalOpen(true)}
                  >
                    Review proposal
                    <ArrowRight size={15} />
                  </button>
                </div>
              )}
              {view === "overview" && (
                <>
                  <Metrics event={event} />
                  <div className="overview-grid">
                    <Overview
                      event={event}
                      setView={setView}
                      onTask={(t) => setEditor({ kind: "task", item: t })}
                      onToggle={(t) => void toggleTask(t)}
                      busy={isBusy}
                    />
                    <aside className="overview-aside">
                      <Assistant
                        key={event.id}
                        event={event}
                        mode={mode}
                        busy={isBusy}
                        onPreview={preview}
                        clarification={clarification}
                      />
                      <PlanningNotes event={event} />
                    </aside>
                  </div>
                </>
              )}
              {view === "budget" && (
                <BudgetView
                  event={event}
                  onAdd={() => setEditor({ kind: "budget" })}
                  onEdit={(i) => setEditor({ kind: "budget", item: i })}
                />
              )}{" "}
              {view === "timeline" && (
                <TimelineView
                  event={event}
                  onAdd={() => setEditor({ kind: "task" })}
                  onEdit={(t) => setEditor({ kind: "task", item: t })}
                  onToggle={(t) => void toggleTask(t)}
                  busy={isBusy}
                />
              )}{" "}
              {view === "vendors" && (
                <VendorsView
                  key={event.id}
                  event={event}
                  onAdd={() => setEditor({ kind: "vendor" })}
                  onEdit={(v) => setEditor({ kind: "vendor", item: v })}
                  onCompare={(ids) => void compare(ids)}
                  busy={busy === "compare"}
                />
              )}{" "}
              {view === "history" && (
                <HistoryView
                  event={event}
                  revisions={revisions}
                  onRestore={setRestore}
                  loading={historyLoading}
                />
              )}
              <footer className="workspace-footer">
                <Flower2 size={15} />A little more clarity. A little more
                together.<span>gatherly.</span>
              </footer>
            </>
          )}
        </main>
      </div>
      {wizard && (
        <Wizard
          onClose={() => setWizard(false)}
          onCreate={create}
          busy={isBusy}
        />
      )}
      {event && editor?.kind === "budget" && (
        <BudgetForm
          event={event}
          item={editor.item}
          onClose={() => setEditor(null)}
          busy={isBusy}
          onSave={(data) =>
            save(
              `/events/${event.id}/budget${editor.item ? `/${editor.item.id}` : ""}`,
              editor.item ? "PATCH" : "POST",
              data,
              "Expense saved. Your budget projection is up to date.",
            )
          }
        />
      )}
      {event && editor?.kind === "task" && (
        <TaskForm
          event={event}
          task={editor.item}
          onClose={() => setEditor(null)}
          busy={isBusy}
          onSave={(data) =>
            save(
              `/events/${event.id}/tasks${editor.item ? `/${editor.item.id}` : ""}`,
              editor.item ? "PATCH" : "POST",
              data,
              "Task saved. Dependencies and readiness have been recalculated.",
            )
          }
        />
      )}
      {event && editor?.kind === "vendor" && (
        <VendorForm
          version={event.version}
          vendor={editor.item}
          onClose={() => setEditor(null)}
          busy={isBusy}
          onSave={(data) =>
            save(
              `/events/${event.id}/vendors${editor.item ? `/${editor.item.id}` : ""}`,
              editor.item ? "PATCH" : "POST",
              data,
              "Vendor quote saved to your shortlist.",
            )
          }
        />
      )}
      {event && assistantOpen && (
        <Modal
          title="Change my plan"
          subtitle="Your celebration can evolve without starting over."
          onClose={() => setAssistantOpen(false)}
          busy={isBusy}
        >
          <div className="assistant-modal">
            <Assistant
              event={event}
              mode={mode}
              onPreview={preview}
              busy={isBusy}
              clarification={clarification}
            />
          </div>
        </Modal>
      )}
      {event && proposal && proposalOpen && (
        <ProposalReview
          proposal={proposal}
          current={event}
          busy={isBusy}
          onClose={() => setProposalOpen(false)}
          onApply={() => void apply()}
          onDiscard={() => void discard()}
        />
      )}
      {event && comparison && (
        <Modal
          title="Good choices start with clear details."
          subtitle="Compare your selected quotes side by side."
          onClose={() => setComparison(null)}
          wide
        >
          <VendorComparison
            vendors={event.vendors.filter((v) => comparison.ids.includes(v.id))}
            result={comparison.result}
          />
          <div className="modal-actions comparison-close">
            <button
              className="button button-primary"
              onClick={() => setComparison(null)}
            >
              Back to my shortlist
            </button>
          </div>
        </Modal>
      )}
      {event && restore && (
        <Modal
          title="Make this your plan again?"
          subtitle={restore.label}
          onClose={() => setRestore(null)}
          busy={isBusy}
        >
          <div className="restore-content">
            <div className="restore-icon">
              <RotateCcw size={28} />
            </div>
            <p>
              This restores the entire saved snapshot from version{" "}
              {restore.version}: your event preferences, budget amounts, task
              statuses and deadlines, and vendor records.
            </p>
            <Callout>
              Your current plan (version {event.version}) will be saved in
              history before restoring, so you can return to it later.
            </Callout>
            <footer className="modal-actions">
              <button
                className="button button-ghost"
                disabled={isBusy}
                onClick={() => setRestore(null)}
              >
                Keep current plan
              </button>
              <button
                className="button button-primary"
                disabled={isBusy}
                onClick={() => void restoreVersion()}
              >
                {isBusy ? (
                  <Loader2 size={17} className="spin" />
                ) : (
                  <RotateCcw size={16} />
                )}
                Restore saved plan
              </button>
            </footer>
          </div>
        </Modal>
      )}
      {toast && (!modalIsOpen || toast.error) && (
        <div
          className={`toast ${toast.error ? "toast-error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertCircle size={20} /> : <Check size={20} />}
          <p>{toast.text}</p>
          <button
            className="icon-button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
          >
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
function UsersIcon() {
  return (
    <span className="users-symbol" aria-hidden="true">
      ♧
    </span>
  );
}
