import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { computeEqualSplit, computeExactSplit, computePercentageSplit, SplitResult } from '../lib/splitting';
import { computeGroupBalances, invalidateGroupBalancesCache } from '../lib/balances';

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

const baseExpenseFields = {
  description: z.string().min(1),
  amount: z.number().positive(),
  category: z.string().optional(),
  incurredAt: z.string().datetime().optional(),
  paidById: z.string().uuid(),
};

const createExpenseSchema = z.discriminatedUnion('splitType', [
  z.object({
    ...baseExpenseFields,
    splitType: z.literal('EQUAL'),
    participantIds: z
      .array(z.string().uuid())
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, 'Duplicate participant'),
  }),
  z.object({
    ...baseExpenseFields,
    splitType: z.literal('PERCENTAGE'),
    participants: z
      .array(z.object({ userId: z.string().uuid(), percentage: z.number().positive() }))
      .min(1)
      .refine((p) => new Set(p.map((x) => x.userId)).size === p.length, 'Duplicate participant'),
  }),
  z.object({
    ...baseExpenseFields,
    splitType: z.literal('EXACT'),
    participants: z
      .array(z.object({ userId: z.string().uuid(), amount: z.number().positive() }))
      .min(1)
      .refine((p) => new Set(p.map((x) => x.userId)).size === p.length, 'Duplicate participant'),
  }),
]);

groupsRouter.post('/:id/expenses', requireGroupMember, async (req, res) => {
  const parsed = createExpenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;
  const groupId = req.params.id;

  const memberIds = new Set(
    (await prisma.groupMember.findMany({ where: { groupId }, select: { userId: true } })).map((m) => m.userId)
  );

  if (!memberIds.has(data.paidById)) {
    return res.status(400).json({ error: 'paidById must be a member of this group' });
  }

  const participantIds = data.splitType === 'EQUAL' ? data.participantIds : data.participants.map((p) => p.userId);
  if (!participantIds.every((id) => memberIds.has(id))) {
    return res.status(400).json({ error: 'All participants must be members of this group' });
  }

  let splits: SplitResult[];
  try {
    if (data.splitType === 'EQUAL') {
      splits = computeEqualSplit(data.amount, data.participantIds);
    } else if (data.splitType === 'PERCENTAGE') {
      splits = computePercentageSplit(data.amount, data.participants);
    } else {
      splits = computeExactSplit(data.amount, data.participants);
    }
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }

  const expense = await prisma.expense.create({
    data: {
      groupId,
      description: data.description,
      amount: data.amount.toFixed(2),
      category: data.category,
      splitType: data.splitType,
      paidById: data.paidById,
      incurredAt: data.incurredAt ? new Date(data.incurredAt) : undefined,
      splits: { create: splits.map((s) => ({ userId: s.userId, amount: s.amount })) },
    },
    include: { splits: true, paidBy: { select: memberSelect } },
  });
  await invalidateGroupBalancesCache(groupId);

  res.status(201).json({ expense });
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
