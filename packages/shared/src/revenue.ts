import { istDate } from "./costSummary";
import type { SessionUsageRecord } from "./costs";

export interface PaymentLike {
  userId: string | null;
  amountInr: number;
  paidAt: string;
  provider: string;
}

export interface UserLike {
  id: string;
  name: string | null;
  createdAt: string;
  isTest: boolean;
}

export interface UserEconomics {
  userId: string;
  name: string | null;
  isTest: boolean;
  joinedAt: string | null;
  sessions: number;
  liveMinutes: number;
  cost: number;
  revenue: number;
  profit: number;
  paid: boolean;
  lastActiveAt: string | null;
}

export interface RevenueSummary {
  revenue: { today: number; month: number; all: number };
  /** Payments made with test or simulated providers, kept out of revenue. */
  testRevenue: number;
  payments: number;
  users: number;
  payingUsers: number;
  /** Total revenue ÷ all users. */
  revenuePerUser: number | null;
  /** Total revenue ÷ paying users. */
  revenuePerPayingUser: number | null;
  /** Cost of sessions tied to a user ÷ all users. */
  costPerUser: number | null;
  profitPerUser: number | null;
  totalCost: number;
  profit: number;
  /** Profit as a share of revenue, or null with no revenue. */
  margin: number | null;
  /** Sessions with no user (from before sign-in existed). */
  unattributed: { sessions: number; cost: number };
  perUser: UserEconomics[];
}

/**
 * Joins usage (costs) with payments (revenue) per user.
 * Test accounts and test payments are excluded from the headline numbers so testing
 * doesn't distort revenue; they still appear in the per-user table, marked as test.
 */
export function summarizeRevenue(
  sessions: SessionUsageRecord[],
  payments: PaymentLike[],
  users: UserLike[],
  now = new Date(),
): RevenueSummary {
  const todayKey = istDate(now);
  const monthKey = todayKey.slice(0, 7);
  const testUserIds = new Set(users.filter((u) => u.isTest).map((u) => u.id));
  const isRealPayment = (p: PaymentLike) => p.provider !== "test" && !(p.userId && testUserIds.has(p.userId));

  const rows = new Map<string, UserEconomics>();
  const row = (id: string): UserEconomics => {
    let r = rows.get(id);
    if (!r) {
      const u = users.find((x) => x.id === id);
      r = {
        userId: id,
        name: u?.name ?? null,
        isTest: u?.isTest ?? false,
        joinedAt: u?.createdAt ?? null,
        sessions: 0,
        liveMinutes: 0,
        cost: 0,
        revenue: 0,
        profit: 0,
        paid: false,
        lastActiveAt: null,
      };
      rows.set(id, r);
    }
    return r;
  };

  for (const u of users) row(u.id);

  let totalCost = 0;
  const unattributed = { sessions: 0, cost: 0 };
  for (const s of sessions) {
    totalCost += s.cost.total;
    if (!s.learnerId) {
      unattributed.sessions += 1;
      unattributed.cost += s.cost.total;
      continue;
    }
    const r = row(s.learnerId);
    r.sessions += 1;
    r.liveMinutes += s.usage.roomMs / 60000;
    r.cost += s.cost.total;
    if (!r.lastActiveAt || s.updatedAt > r.lastActiveAt) r.lastActiveAt = s.updatedAt;
  }

  const revenue = { today: 0, month: 0, all: 0 };
  let testRevenue = 0;
  let realPayments = 0;
  for (const p of payments) {
    if (p.userId) {
      const r = row(p.userId);
      r.revenue += p.amountInr;
      r.paid = true;
    }
    if (!isRealPayment(p)) {
      testRevenue += p.amountInr;
      continue;
    }
    realPayments += 1;
    revenue.all += p.amountInr;
    const day = istDate(new Date(p.paidAt));
    if (day === todayKey) revenue.today += p.amountInr;
    if (day.startsWith(monthKey)) revenue.month += p.amountInr;
  }

  for (const r of rows.values()) r.profit = r.revenue - r.cost;

  // Headline per-user numbers use real (non-test) users only.
  const realRows = [...rows.values()].filter((r) => !r.isTest);
  const users_ = realRows.length;
  const paying = realRows.filter((r) => r.paid).length;
  const realUserCost = realRows.reduce((sum, r) => sum + r.cost, 0);
  const profit = revenue.all - totalCost;

  return {
    revenue,
    testRevenue,
    payments: realPayments,
    users: users_,
    payingUsers: paying,
    revenuePerUser: users_ ? revenue.all / users_ : null,
    revenuePerPayingUser: paying ? revenue.all / paying : null,
    costPerUser: users_ ? realUserCost / users_ : null,
    profitPerUser: users_ ? (revenue.all - realUserCost) / users_ : null,
    totalCost,
    profit,
    margin: revenue.all > 0 ? profit / revenue.all : null,
    unattributed,
    perUser: [...rows.values()].sort((a, b) => (b.lastActiveAt ?? b.joinedAt ?? "").localeCompare(a.lastActiveAt ?? a.joinedAt ?? "")),
  };
}
