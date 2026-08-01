import { centsToAmount, toCents } from './money';

export interface SplitResult {
  userId: string;
  amount: string;
}

function reconcileRounding(items: { cents: number }[], totalCents: number) {
  let diff = totalCents - items.reduce((sum, i) => sum + i.cents, 0);
  let i = 0;
  while (diff !== 0 && items.length > 0) {
    items[i % items.length].cents += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
    i += 1;
  }
}

export function computeEqualSplit(totalAmount: number, participantIds: string[]): SplitResult[] {
  const totalCents = toCents(totalAmount);
  const base = Math.floor(totalCents / participantIds.length);
  const items = participantIds.map((userId) => ({ userId, cents: base }));
  reconcileRounding(items, totalCents);
  return items.map((i) => ({ userId: i.userId, amount: centsToAmount(i.cents) }));
}

export function computePercentageSplit(
  totalAmount: number,
  participants: { userId: string; percentage: number }[]
): SplitResult[] {
  const totalPercentage = participants.reduce((sum, p) => sum + p.percentage, 0);
  if (Math.abs(totalPercentage - 100) > 0.01) {
    throw new Error(`Percentages must add up to 100 (got ${totalPercentage})`);
  }

  const totalCents = toCents(totalAmount);
  const items = participants.map((p) => ({
    userId: p.userId,
    cents: Math.round((totalCents * p.percentage) / 100),
  }));
  reconcileRounding(items, totalCents);
  return items.map((i) => ({ userId: i.userId, amount: centsToAmount(i.cents) }));
}

function computeSumValidatedSplit(
  totalAmount: number,
  participants: { userId: string; amount: number }[],
  label: string
): SplitResult[] {
  const totalCents = toCents(totalAmount);
  const items = participants.map((p) => ({ userId: p.userId, cents: toCents(p.amount) }));
  const sumCents = items.reduce((sum, i) => sum + i.cents, 0);

  if (sumCents !== totalCents) {
    throw new Error(`${label} (${centsToAmount(sumCents)}) must add up to the total (${centsToAmount(totalCents)})`);
  }

  return items.map((i) => ({ userId: i.userId, amount: centsToAmount(i.cents) }));
}

export function computeExactSplit(
  totalAmount: number,
  participants: { userId: string; amount: number }[]
): SplitResult[] {
  return computeSumValidatedSplit(totalAmount, participants, 'Exact amounts');
}

export function computeSharesSplit(
  totalAmount: number,
  participants: { userId: string; shares: number }[]
): SplitResult[] {
  const totalShares = participants.reduce((sum, p) => sum + p.shares, 0);
  if (totalShares <= 0) {
    throw new Error('Total shares must be greater than 0');
  }

  const totalCents = toCents(totalAmount);
  const items = participants.map((p) => ({
    userId: p.userId,
    cents: Math.round((totalCents * p.shares) / totalShares),
  }));
  reconcileRounding(items, totalCents);
  return items.map((i) => ({ userId: i.userId, amount: centsToAmount(i.cents) }));
}

export function validatePayments(
  totalAmount: number,
  payments: { userId: string; amount: number }[]
): SplitResult[] {
  return computeSumValidatedSplit(totalAmount, payments, 'Payment amounts');
}
