import { centsToAmount } from './money';

export interface Transfer {
  fromUserId: string;
  toUserId: string;
  amount: string;
}

/**
 * Reduces a group's net balances to the minimum number of payments needed to
 * settle everyone up, by greedily matching the largest creditor against the
 * largest debtor (the standard Splitwise-style debt simplification approach).
 */
export function simplifyDebts(balancesCents: Record<string, number>): Transfer[] {
  const creditors = Object.entries(balancesCents)
    .filter(([, cents]) => cents > 0)
    .map(([userId, cents]) => ({ userId, cents }))
    .sort((a, b) => b.cents - a.cents);

  const debtors = Object.entries(balancesCents)
    .filter(([, cents]) => cents < 0)
    .map(([userId, cents]) => ({ userId, cents: -cents }))
    .sort((a, b) => b.cents - a.cents);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(debtor.cents, creditor.cents);

    if (amount > 0) {
      transfers.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amount: centsToAmount(amount) });
    }

    debtor.cents -= amount;
    creditor.cents -= amount;

    if (debtor.cents === 0) i += 1;
    if (creditor.cents === 0) j += 1;
  }

  return transfers;
}
