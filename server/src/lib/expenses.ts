import { prisma } from './prisma';
import { computeEqualSplit, computeExactSplit, computePercentageSplit, SplitResult } from './splitting';
import { invalidateGroupBalancesCache } from './balances';
import { categorizeExpense } from './openai';
import type { CreateExpenseInput } from './expenseSchema';

export class ExpenseValidationError extends Error {}

const memberSelect = { id: true, name: true, email: true } as const;

export async function createExpenseInGroup(
  groupId: string,
  data: CreateExpenseInput,
  source: 'MANUAL' | 'PLAID' = 'MANUAL'
) {
  const memberIds = new Set(
    (await prisma.groupMember.findMany({ where: { groupId }, select: { userId: true } })).map((m) => m.userId)
  );

  if (!memberIds.has(data.paidById)) {
    throw new ExpenseValidationError('paidById must be a member of this group');
  }

  const participantIds = data.splitType === 'EQUAL' ? data.participantIds : data.participants.map((p) => p.userId);
  if (!participantIds.every((id) => memberIds.has(id))) {
    throw new ExpenseValidationError('All participants must be members of this group');
  }

  let splits: SplitResult[];
  if (data.splitType === 'EQUAL') {
    splits = computeEqualSplit(data.amount, data.participantIds);
  } else if (data.splitType === 'PERCENTAGE') {
    splits = computePercentageSplit(data.amount, data.participants);
  } else {
    splits = computeExactSplit(data.amount, data.participants);
  }

  const category = data.category ?? (await categorizeExpense(data.description));

  const expense = await prisma.expense.create({
    data: {
      groupId,
      description: data.description,
      amount: data.amount.toFixed(2),
      category,
      splitType: data.splitType,
      source,
      paidById: data.paidById,
      incurredAt: data.incurredAt ? new Date(data.incurredAt) : undefined,
      splits: { create: splits.map((s) => ({ userId: s.userId, amount: s.amount })) },
    },
    include: { splits: true, paidBy: { select: memberSelect } },
  });

  await invalidateGroupBalancesCache(groupId);
  return expense;
}
