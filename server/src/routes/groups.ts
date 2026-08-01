import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { computeGroupBalances, invalidateGroupBalancesCache } from '../lib/balances';
import { createExpenseSchema } from '../lib/expenseSchema';
import {
  createExpenseInGroup,
  deleteExpenseFromGroup,
  expenseInclude,
  ExpenseValidationError,
  updateExpenseInGroup,
} from '../lib/expenses';
import { getGroupSpendingInsights } from '../lib/insights';
import { computeGroupBalances as computeBalances } from '../lib/balances';
import { sendPushToUser, sendPushToUsers } from '../lib/push';

export const groupsRouter = Router();

groupsRouter.use(requireAuth);

const memberSelect = { id: true, name: true, email: true } as const;

async function requireGroupMember(req: Request, res: Response, next: NextFunction) {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: req.params.id, userId: req.userId! } },
  });
  if (!membership) {
    return res.status(403).json({ error: 'Not a member of this group' });
  }
  next();
}

async function requireGroupAdmin(req: Request, res: Response, next: NextFunction) {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: req.params.id, userId: req.userId! } },
  });
  if (!membership?.isAdmin) {
    return res.status(403).json({ error: 'Only a group admin can do this' });
  }
  next();
}

async function assertSettledUp(groupId: string, userId: string) {
  const { netBalances } = await computeBalances(groupId);
  const balance = netBalances.find((b) => b.userId === userId);
  if (balance && Math.abs(Number(balance.amount)) >= 0.01) {
    throw new ExpenseValidationError('This member has an outstanding balance and cannot leave or be removed yet');
  }
}

groupsRouter.post('/', async (req, res) => {
  const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const group = await prisma.group.create({
    data: {
      name: parsed.data.name,
      members: { create: { userId: req.userId!, isAdmin: true } },
    },
    include: { members: { include: { user: { select: memberSelect } } } },
  });

  res.status(201).json({ group });
});

groupsRouter.get('/', async (req, res) => {
  const groups = await prisma.group.findMany({
    where: { members: { some: { userId: req.userId! } } },
    include: { members: { include: { user: { select: memberSelect } } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ groups });
});

groupsRouter.get('/:id', requireGroupMember, async (req, res) => {
  const group = await prisma.group.findUnique({
    where: { id: req.params.id },
    include: { members: { include: { user: { select: memberSelect } } } },
  });
  res.json({ group });
});

groupsRouter.delete('/:id', requireGroupAdmin, async (req, res) => {
  const groupId = req.params.id;
  const { netBalances } = await computeBalances(groupId);
  const unsettled = netBalances.some((b) => Math.abs(Number(b.amount)) >= 0.01);
  if (unsettled) {
    return res.status(400).json({ error: 'This group has outstanding balances and cannot be deleted yet' });
  }

  await prisma.group.delete({ where: { id: groupId } });
  await invalidateGroupBalancesCache(groupId);
  res.status(204).send();
});

const addMemberSchema = z.object({ email: z.string().email() });

groupsRouter.post('/:id/members', requireGroupMember, async (req, res) => {
  const parsed = addMemberSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) return res.status(404).json({ error: 'No user found with that email' });

  const existing = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: req.params.id, userId: user.id } },
  });
  if (existing) return res.status(409).json({ error: 'User is already a member of this group' });

  const member = await prisma.groupMember.create({
    data: { groupId: req.params.id, userId: user.id },
    include: { user: { select: memberSelect } },
  });
  await invalidateGroupBalancesCache(req.params.id);

  const group = await prisma.group.findUnique({ where: { id: req.params.id }, select: { name: true } });
  await sendPushToUser(user.id, {
    title: 'Added to a group',
    body: `You were added to "${group?.name ?? 'a group'}"`,
    url: `/groups/${req.params.id}`,
  });

  res.status(201).json({ member });
});

groupsRouter.delete('/:id/members/:userId', requireGroupMember, async (req, res) => {
  const groupId = req.params.id;
  const targetUserId = req.params.userId;
  const isSelf = targetUserId === req.userId;

  if (!isSelf) {
    const requester = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: req.userId! } },
    });
    if (!requester?.isAdmin) {
      return res.status(403).json({ error: 'Only a group admin can remove other members' });
    }
  }

  const target = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: targetUserId } },
  });
  if (!target) {
    return res.status(404).json({ error: 'That user is not a member of this group' });
  }
  if (target.isAdmin) {
    return res.status(400).json({ error: 'The group admin cannot be removed. Delete the group instead.' });
  }

  try {
    await assertSettledUp(groupId, targetUserId);
  } catch (err) {
    if (err instanceof ExpenseValidationError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }

  await prisma.groupMember.delete({ where: { groupId_userId: { groupId, userId: targetUserId } } });
  await invalidateGroupBalancesCache(groupId);

  res.status(204).send();
});

groupsRouter.post('/:id/expenses', requireGroupMember, async (req, res) => {
  const parsed = createExpenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const expense = await createExpenseInGroup(req.params.id, parsed.data, 'MANUAL');
    res.status(201).json({ expense });

    prisma.groupMember
      .findMany({ where: { groupId: req.params.id }, select: { userId: true } })
      .then((members) =>
        sendPushToUsers(
          members.map((m) => m.userId).filter((id) => id !== req.userId),
          { title: 'New expense added', body: `${expense.description} — $${expense.amount}`, url: `/groups/${req.params.id}` }
        )
      )
      .catch((err) => console.error('Failed to send expense notifications:', (err as Error).message));
  } catch (err) {
    if (err instanceof ExpenseValidationError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});

groupsRouter.get('/:id/expenses', requireGroupMember, async (req, res) => {
  const expenses = await prisma.expense.findMany({
    where: { groupId: req.params.id },
    include: expenseInclude,
    orderBy: { incurredAt: 'desc' },
  });
  res.json({ expenses });
});

groupsRouter.put('/:id/expenses/:expenseId', requireGroupMember, async (req, res) => {
  const parsed = createExpenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const expense = await updateExpenseInGroup(req.params.id, req.params.expenseId, parsed.data);
    res.json({ expense });
  } catch (err) {
    if (err instanceof ExpenseValidationError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});

groupsRouter.delete('/:id/expenses/:expenseId', requireGroupMember, async (req, res) => {
  try {
    await deleteExpenseFromGroup(req.params.id, req.params.expenseId);
    res.status(204).send();
  } catch (err) {
    if (err instanceof ExpenseValidationError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});

groupsRouter.get('/:id/balances', requireGroupMember, async (req, res) => {
  const balances = await computeGroupBalances(req.params.id);
  res.json(balances);
});

const createSettlementSchema = z.object({
  fromUserId: z.string().uuid(),
  toUserId: z.string().uuid(),
  amount: z.number().positive(),
});

groupsRouter.post('/:id/settlements', requireGroupMember, async (req, res) => {
  const parsed = createSettlementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { fromUserId, toUserId, amount } = parsed.data;
  const groupId = req.params.id;

  if (fromUserId === toUserId) {
    return res.status(400).json({ error: 'fromUserId and toUserId must differ' });
  }

  const memberIds = new Set(
    (await prisma.groupMember.findMany({ where: { groupId }, select: { userId: true } })).map((m) => m.userId)
  );
  if (!memberIds.has(fromUserId) || !memberIds.has(toUserId)) {
    return res.status(400).json({ error: 'Both users must be members of this group' });
  }

  const settlement = await prisma.settlement.create({
    data: { groupId, fromUserId, toUserId, amount: amount.toFixed(2) },
  });
  await invalidateGroupBalancesCache(groupId);

  res.status(201).json({ settlement });

  const notifyUserId = req.userId === fromUserId ? toUserId : fromUserId;
  sendPushToUser(notifyUserId, {
    title: 'Settlement recorded',
    body: `A payment of $${settlement.amount} was recorded`,
    url: `/groups/${groupId}`,
  }).catch((err) => console.error('Failed to send settlement notification:', (err as Error).message));
});

groupsRouter.get('/:id/settlements', requireGroupMember, async (req, res) => {
  const settlements = await prisma.settlement.findMany({
    where: { groupId: req.params.id },
    include: {
      fromUser: { select: memberSelect },
      toUser: { select: memberSelect },
    },
    orderBy: { settledAt: 'desc' },
  });
  res.json({ settlements });
});

groupsRouter.get('/:id/insights', requireGroupMember, async (req, res) => {
  const month = typeof req.query.month === 'string' ? req.query.month : undefined;
  const insights = await getGroupSpendingInsights(req.params.id, month);
  res.json(insights);
});
