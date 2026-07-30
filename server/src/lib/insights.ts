import { prisma } from './prisma';
import { centsToAmount, toCents } from './money';
import { generateSpendingInsights } from './openai';

export interface GroupSpendingInsights {
  month: string;
  total: string;
  byCategory: { category: string; amount: string }[];
  summary: string;
}

export async function getGroupSpendingInsights(groupId: string, month?: string): Promise<GroupSpendingInsights> {
  const now = new Date();
  const [year, monthNum] = month ? month.split('-').map(Number) : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const start = new Date(Date.UTC(year, monthNum - 1, 1));
  const end = new Date(Date.UTC(year, monthNum, 1));
  const monthLabel = `${year}-${String(monthNum).padStart(2, '0')}`;

  const expenses = await prisma.expense.findMany({ where: { groupId, incurredAt: { gte: start, lt: end } } });

  const byCategoryCents = new Map<string, number>();
  let totalCents = 0;
  for (const expense of expenses) {
    const cents = toCents(expense.amount.toString());
    totalCents += cents;
    const category = expense.category ?? 'Other';
    byCategoryCents.set(category, (byCategoryCents.get(category) ?? 0) + cents);
  }

  const byCategory = Array.from(byCategoryCents.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([category, cents]) => ({ category, amount: centsToAmount(cents) }));

  const summary =
    expenses.length === 0
      ? 'No expenses recorded for this group in the selected month.'
      : await generateSpendingInsights({
          month: monthLabel,
          totalUsd: centsToAmount(totalCents),
          byCategory: byCategory.map((c) => ({ category: c.category, amountUsd: c.amount })),
        });

  return { month: monthLabel, total: centsToAmount(totalCents), byCategory, summary };
}
