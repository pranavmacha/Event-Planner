import { useEffect, useRef, isValidElement, type ReactNode } from "react";
import {
  X,
  Loader2,
  ArrowUpRight,
  Check,
  Flower2,
  ArrowRight,
  AlertCircle,
} from "lucide-react";

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? "brand-small" : ""}`}>
      <span className="brand-mark">
        <Flower2 size={small ? 22 : 27} strokeWidth={1.6} />
      </span>
      <span>
        gatherly<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
export function Spinner({
  label = "A little planning in progress…",
}: {
  label?: string;
}) {
  return (
    <div className="loading-state" role="status">
      <Loader2 size={23} className="spin" />
      <span>{label}</span>
    </div>
  );
}
export function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}
export function SectionTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {children}
    </div>
  );
}
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Field({
  label,
  hint,
  children,
  full = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  full?: boolean;
}) {
  const Wrapper =
    isValidElement(children) &&
    ["input", "select", "textarea"].includes(children.type as string)
      ? "label"
      : "div";
  return (
    <Wrapper className={`field ${full ? "field-full" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </Wrapper>
  );
}
export function Callout({
  children,
  tone = "warm",
}: {
  children: ReactNode;
  tone?: "warm" | "error" | "green";
}) {
  return (
    <div className={`callout callout-${tone}`}>
      <AlertCircle size={17} />
      <div>{children}</div>
    </div>
  );
}
export function SubmitButton({
  busy,
  children,
}: {
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <button className="button button-primary" type="submit" disabled={busy}>
      {busy ? <Loader2 size={17} className="spin" /> : <Check size={17} />}{" "}
      {busy ? "Saving…" : children}
    </button>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  busy = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const content = ref.current;
    const targets = () =>
      Array.from(
        content?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
        ) || [],
      ).filter((x) => x.getClientRects().length > 0);
    targets()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const list = targets(),
          first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={`modal ${wide ? "modal-wide" : ""}`}
      >
        <header className="modal-heading">
          <div>
            <p className="eyebrow">THOUGHTFULLY PLANNED</p>
            <h2 id="dialog-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            disabled={busy}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export function TextLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ArrowRight size={16} />
    </button>
  );
}
export function ExternalNote({ children }: { children: ReactNode }) {
  return (
    <div className="external-note">
      <ArrowUpRight size={14} />
      {children}
    </div>
  );
}
