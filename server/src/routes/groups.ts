import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { computeGroupBalances, invalidateGroupBalancesCache } from '../lib/balances';
import { createExpenseSchema } from '../lib/expenseSchema';
import { createExpenseInGroup, ExpenseValidationError } from '../lib/expenses';

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

  res.status(201).json({ member });
});

groupsRouter.post('/:id/expenses', requireGroupMember, async (req, res) => {
  const parsed = createExpenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const expense = await createExpenseInGroup(req.params.id, parsed.data, 'MANUAL');
    res.status(201).json({ expense });
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
    include: { splits: true, paidBy: { select: memberSelect } },
    orderBy: { incurredAt: 'desc' },
  });
  res.json({ expenses });
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
});
