export type Category =
  | "food"
  | "venue"
  | "decor"
  | "photography"
  | "entertainment"
  | "logistics"
  | "other";
export const categories: Category[] = [
  "food",
  "venue",
  "decor",
  "photography",
  "entertainment",
  "logistics",
  "other",
];
export const categoryNames: Record<Category, string> = {
  food: "Food & beverages",
  venue: "Venue",
  decor: "Decor & flowers",
  photography: "Photography",
  entertainment: "Entertainment",
  logistics: "Guest comfort & logistics",
  other: "Other details",
};
export interface EventInput {
  name: string;
  occasion: string;
  city: string;
  event_date: string;
  budget_paise: number;
  guest_count: number;
  atmosphere: string;
  theme: string;
  priorities: string[];
  non_negotiables: string[];
  dietary_preferences: string;
  accessibility_needs: string;
  cultural_preferences: string;
}
export interface BudgetItem {
  id: string;
  category: Category;
  label: string;
  cost_type: "fixed" | "per_person";
  estimate_paise: number;
  quoted_paise: number | null;
  committed_paise: number | null;
  actual_paise: number | null;
  quote_guest_count: number | null;
  source: "estimate" | "user";
  notes: string;
  projected_paise: number;
  projection_basis: string;
}
export interface Task {
  id: string;
  title: string;
  due_date: string;
  priority: "high" | "medium" | "low";
  status: "todo" | "in_progress" | "done";
  dependencies: string[];
  notes: string;
  readiness: "ready" | "blocked" | "at_risk" | "done";
  reasons: string[];
}
export interface Vendor {
  id: string;
  name: string;
  category: Category;
  quoted_paise: number;
  total_paise: number;
  guests_covered: number | null;
  inclusions: string;
  exclusions: string;
  taxes_paise: number;
  additional_charges_paise: number;
  payment_terms: string;
  availability: "unknown" | "available" | "unavailable";
  booking_status: "considering" | "contacted" | "booked";
  sample: boolean;
  notes: string;
}
export interface Summary {
  projected_paise: number;
  reserve_paise: number;
  remaining_paise: number;
  overspend_paise: number;
  committed_paise: number;
  actual_paise: number;
  days_remaining: number;
  completed_tasks: number;
  total_tasks: number;
  category_totals: Record<string, number>;
}
export interface PlanningEvent extends EventInput {
  id: string;
  version: number;
  concept: string;
  assumptions: string[];
  decisions: string[];
  risks: string[];
  ai_mode: "demo" | "live";
  budget_items: BudgetItem[];
  tasks: Task[];
  vendors: Vendor[];
  summary: Summary;
}
export type EventSummary = Pick<
  PlanningEvent,
  "id" | "name" | "occasion" | "city" | "event_date" | "version"
>;
export interface Proposal {
  id: string;
  base_version: number;
  status: "pending" | "applied" | "discarded";
  message: string;
  changes: Partial<
    Pick<
      EventInput,
      "guest_count" | "budget_paise" | "event_date" | "priorities"
    >
  >;
  before: PlanningEvent;
  after: PlanningEvent;
  category_impacts: {
    category: Category;
    before_paise: number;
    after_paise: number;
    reason: string;
  }[];
  task_impacts: {
    id: string;
    title: string;
    before_date: string;
    after_date: string;
    reason: string;
  }[];
  tradeoffs: string[];
  warnings: string[];
  assumptions: string[];
  ai_mode: "demo" | "live";
}
export interface Revision {
  id: string;
  created_at: string;
  label: string;
  version: number;
  restored: boolean;
}
export interface Comparison {
  summary: string;
  tradeoffs: string[];
  questions: string[];
  ai_mode: string;
}
