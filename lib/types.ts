export type Fragment = {
  id: string;
  text: string;
  categories: string[];
  amount: number | null;
  kind: string | null;
  date: string;
  status: string;
  intent?: "buy" | "eat" | null;
  item?: string | null;
  done?: boolean;
};
export type Memo = {
  id: string;
  body: string;
  created_at: string;
  fragments: Fragment[];
};
export type Entry = {
  id: string;
  title: string;
  amount: number;
  kind: string;
  occurred_on: string;
  payment_method: string;
  voided_at: string | null;
};
export type Schedule = {
  id: string;
  title: string;
  amount: number;
  kind: string;
  recurrence: string;
  day_of_month: number | null;
  start_date: string;
  end_date: string | null;
  active: boolean;
};
export type Settlement = { schedule_id: string; due_date: string };
export type Totals = {
  income: number;
  expense: number;
  refund: number;
  repayment: number;
  net: number;
  count: number;
};
export type Data = {
  memos: Memo[];
  entries: Entry[];
  schedules: Schedule[];
  settlements: Settlement[];
  totals: Totals | null;
  monthTotals: Totals | null;
  entriesTruncated: boolean;
  memosTruncated: boolean;
};
