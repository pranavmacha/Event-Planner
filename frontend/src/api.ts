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
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
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
export const money = (paise: number, options: { compact?: boolean } = {}) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
    ...(options.compact
      ? { notation: "compact", maximumFractionDigits: 1 }
      : ({} as object)),
  }).format(paise / 100);
export const dateLabel = (date: string, short = false) =>
  new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: short ? "short" : "long",
    ...(short ? {} : { year: "numeric" }),
  });
export const currencyInput = (value: number | null) =>
  value === null ? "" : String(value / 100);
export function paise(value: FormDataEntryValue | null) {
  return Math.round(Number(value || 0) * 100);
}
export const sentence = (v: string) =>
  v.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
