export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    signal: options.signal,
    headers:
      body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    let detail = data?.detail;
    if (Array.isArray(detail))
      detail = detail
        .map(
          (d: { loc?: string[]; msg?: string }) =>
            `${d.loc?.slice(1).join(" · ") || "Input"}: ${d.msg || "Please check this value"}`,
        )
        .join(". ");
    throw new ApiError(
      typeof detail === "string"
        ? detail
        : "We could not save that change. Please try again.",
      response.status,
    );
  }
  return data as T;
}
const currencyFormatter = (maximumFractionDigits: number, compact = false) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits,
    ...(compact ? { notation: "compact" as const } : {}),
  });
const wholeCurrency = currencyFormatter(0);
const fractionalCurrency = currencyFormatter(2);
const compactCurrency = currencyFormatter(1, true);
export const money = (paise: number, options: { compact?: boolean } = {}) =>
  (options.compact
    ? compactCurrency
    : paise % 100 === 0
      ? wholeCurrency
      : fractionalCurrency
  ).format(paise / 100);
const shortDate = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
});
const fullDate = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
export const dateLabel = (date: string, short = false) =>
  (short ? shortDate : fullDate).format(
    new Date(`${date.slice(0, 10)}T12:00:00`),
  );
export const currencyInput = (value: number | null) =>
  value === null ? "" : String(value / 100);
export function paise(value: FormDataEntryValue | null) {
  return Math.round(Number(value || 0) * 100);
}
export const sentence = (v: string) =>
  v.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
