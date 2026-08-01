import { prisma } from './prisma';
import { centsToAmount, toCents } from './money';
import { computeGroupBalances } from './balances';

export interface DashboardData {
  totalOwedToYou: string;
  totalYouOwe: string;
  groups: { id: string; name: string; memberCount: number; yourBalance: string }[];
  recentExpenses: {
    id: string;
    groupId: string;
    groupName: string;
    description: string;
    amount: string;
    category: string | null;
    incurredAt: Date;
  }[];
  pendingSettlements: {
    groupId: string;
    groupName: string;
    fromUserId: string;
    fromUserName: string;
    toUserId: string;
    toUserName: string;
    amount: string;
  }[];
}

export async function getDashboard(userId: string): Promise<DashboardData> {
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    include: { group: { include: { members: { include: { user: { select: { id: true, name: true } } } } } } },
  });

  let totalOwedToYouCents = 0;
  let totalYouOweCents = 0;
  const groups: DashboardData['groups'] = [];
  const pendingSettlements: DashboardData['pendingSettlements'] = [];

  for (const membership of memberships) {
    const group = membership.group;
    const { netBalances, transfers } = await computeGroupBalances(group.id);
    const mine = netBalances.find((b) => b.userId === userId);
    const cents = mine ? toCents(mine.amount) : 0;
    if (cents > 0) totalOwedToYouCents += cents;
    if (cents < 0) totalYouOweCents += -cents;

    groups.push({
      id: group.id,
      name: group.name,
      memberCount: group.members.length,
      yourBalance: mine?.amount ?? '0.00',
    });

    const nameById = new Map(group.members.map((m) => [m.userId, m.user.name]));
    for (const t of transfers) {
      if (t.fromUserId === userId || t.toUserId === userId) {
        pendingSettlements.push({
          groupId: group.id,
          groupName: group.name,
          fromUserId: t.fromUserId,
          fromUserName: nameById.get(t.fromUserId) ?? 'Unknown',
          toUserId: t.toUserId,
          toUserName: nameById.get(t.toUserId) ?? 'Unknown',
          amount: t.amount,
        });
      }
    }
  }

  const groupIds = memberships.map((m) => m.groupId);
  const recentExpensesRaw =
    groupIds.length === 0
      ? []
      : await prisma.expense.findMany({
          where: { groupId: { in: groupIds } },
          include: { group: { select: { name: true } } },
          orderBy: { incurredAt: 'desc' },
          take: 10,
        });

  const recentExpenses = recentExpensesRaw.map((e) => ({
    id: e.id,
    groupId: e.groupId,
    groupName: e.group.name,
    description: e.description,
    amount: e.amount.toString(),
    category: e.category,
    incurredAt: e.incurredAt,
  }));

  return {
    totalOwedToYou: centsToAmount(totalOwedToYouCents),
    totalYouOwe: centsToAmount(totalYouOweCents),
    groups,
    recentExpenses,
    pendingSettlements,
  };
}
