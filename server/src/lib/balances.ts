import { prisma } from './prisma';
import { redis } from './redis';
import { centsToAmount, toCents } from './money';
import { simplifyDebts, Transfer } from './debtSimplification';

export interface GroupBalances {
  netBalances: { userId: string; amount: string }[];
  transfers: Transfer[];
}

const CACHE_TTL_SECONDS = 60;

function cacheKey(groupId: string) {
  return `group:${groupId}:balances`;
}

async function computeGroupBalancesFromDb(groupId: string): Promise<GroupBalances> {
  const [expenses, settlements, members] = await Promise.all([
    prisma.expense.findMany({ where: { groupId }, include: { splits: true, payments: true } }),
    prisma.settlement.findMany({ where: { groupId } }),
    prisma.groupMember.findMany({ where: { groupId }, select: { userId: true } }),
  ]);

  const balanceCents: Record<string, number> = {};
  for (const member of members) balanceCents[member.userId] = 0;

  for (const expense of expenses) {
    for (const payment of expense.payments) {
      balanceCents[payment.userId] = (balanceCents[payment.userId] ?? 0) + toCents(payment.amount.toString());
    }
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

/**
 * Positive net balance = the group owes this person; negative = they owe the group.
 * Cached in Redis (cache-aside, 60s TTL) since this is recomputed from every expense
 * and settlement in the group on every read; writes explicitly invalidate the entry.
 */
export async function computeGroupBalances(groupId: string): Promise<GroupBalances> {
  const cached = await redis.get(cacheKey(groupId)).catch(() => null);
  if (cached) {
    return JSON.parse(cached) as GroupBalances;
  }

  const result = await computeGroupBalancesFromDb(groupId);

  await redis.set(cacheKey(groupId), JSON.stringify(result), 'EX', CACHE_TTL_SECONDS).catch(() => undefined);

  return result;
}

export async function invalidateGroupBalancesCache(groupId: string): Promise<void> {
  await redis.del(cacheKey(groupId)).catch(() => undefined);
}
