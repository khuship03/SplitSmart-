import { prisma } from './prisma';
import { centsToAmount, toCents } from './money';
import { simplifyDebts, Transfer } from './debtSimplification';

export interface GroupBalances {
  netBalances: { userId: string; amount: string }[];
  transfers: Transfer[];
}

/**
 * Positive net balance = the group owes this person; negative = they owe the group.
 */
export async function computeGroupBalances(groupId: string): Promise<GroupBalances> {
  const [expenses, settlements, members] = await Promise.all([
    prisma.expense.findMany({ where: { groupId }, include: { splits: true } }),
    prisma.settlement.findMany({ where: { groupId } }),
    prisma.groupMember.findMany({ where: { groupId }, select: { userId: true } }),
  ]);

  const balanceCents: Record<string, number> = {};
  for (const member of members) balanceCents[member.userId] = 0;

  for (const expense of expenses) {
    balanceCents[expense.paidById] = (balanceCents[expense.paidById] ?? 0) + toCents(expense.amount.toString());
    for (const split of expense.splits) {
      balanceCents[split.userId] = (balanceCents[split.userId] ?? 0) - toCents(split.amount.toString());
    }
  }

  for (const settlement of settlements) {
    const cents = toCents(settlement.amount.toString());
    balanceCents[settlement.fromUserId] = (balanceCents[settlement.fromUserId] ?? 0) + cents;
    balanceCents[settlement.toUserId] = (balanceCents[settlement.toUserId] ?? 0) - cents;
  }

  const netBalances = Object.entries(balanceCents).map(([userId, cents]) => ({
    userId,
    amount: centsToAmount(cents),
  }));

  return { netBalances, transfers: simplifyDebts(balanceCents) };
}
