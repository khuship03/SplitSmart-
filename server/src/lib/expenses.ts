import { prisma } from './prisma';
import {
  computeEqualSplit,
  computeExactSplit,
  computePercentageSplit,
  computeSharesSplit,
  validatePayments,
  SplitResult,
} from './splitting';
import { invalidateGroupBalancesCache } from './balances';
import { categorizeExpense } from './openai';
import type { CreateExpenseInput } from './expenseSchema';

export class ExpenseValidationError extends Error {}

const memberSelect = { id: true, name: true, email: true } as const;
const expenseInclude = {
  splits: true,
  payments: { include: { user: { select: memberSelect } } },
} as const;

function computeSplitsForData(data: CreateExpenseInput): SplitResult[] {
  if (data.splitType === 'EQUAL') return computeEqualSplit(data.amount, data.participantIds);
  if (data.splitType === 'PERCENTAGE') return computePercentageSplit(data.amount, data.participants);
  if (data.splitType === 'EXACT') return computeExactSplit(data.amount, data.participants);
  return computeSharesSplit(data.amount, data.participants);
}

async function validateMembership(groupId: string, data: CreateExpenseInput) {
  const memberIds = new Set(
    (await prisma.groupMember.findMany({ where: { groupId }, select: { userId: true } })).map((m) => m.userId)
  );

  if (!data.payments.every((p) => memberIds.has(p.userId))) {
    throw new ExpenseValidationError('All payers must be members of this group');
  }

  const participantIds = data.splitType === 'EQUAL' ? data.participantIds : data.participants.map((p) => p.userId);
  if (!participantIds.every((id) => memberIds.has(id))) {
    throw new ExpenseValidationError('All participants must be members of this group');
  }
}

function computeSplitsAndPayments(data: CreateExpenseInput): { splits: SplitResult[]; payments: SplitResult[] } {
  try {
    return { splits: computeSplitsForData(data), payments: validatePayments(data.amount, data.payments) };
  } catch (err) {
    throw new ExpenseValidationError((err as Error).message);
  }
}

export async function createExpenseInGroup(
  groupId: string,
  data: CreateExpenseInput,
  source: 'MANUAL' | 'PLAID' = 'MANUAL'
) {
  await validateMembership(groupId, data);
  const { splits, payments } = computeSplitsAndPayments(data);
  const category = data.category ?? (await categorizeExpense(data.description));

  const expense = await prisma.expense.create({
    data: {
      groupId,
      description: data.description,
      amount: data.amount.toFixed(2),
      category,
      splitType: data.splitType,
      source,
      incurredAt: data.incurredAt ? new Date(data.incurredAt) : undefined,
      splits: { create: splits.map((s) => ({ userId: s.userId, amount: s.amount })) },
      payments: { create: payments.map((p) => ({ userId: p.userId, amount: p.amount })) },
    },
    include: expenseInclude,
  });

  await invalidateGroupBalancesCache(groupId);
  return expense;
}

export async function updateExpenseInGroup(groupId: string, expenseId: string, data: CreateExpenseInput) {
  const existing = await prisma.expense.findFirst({ where: { id: expenseId, groupId } });
  if (!existing) {
    throw new ExpenseValidationError('Expense not found in this group');
  }

  await validateMembership(groupId, data);
  const { splits, payments } = computeSplitsAndPayments(data);
  const category = data.category ?? (await categorizeExpense(data.description));

  const expense = await prisma.$transaction(async (tx) => {
    await tx.expenseSplit.deleteMany({ where: { expenseId } });
    await tx.expensePayment.deleteMany({ where: { expenseId } });
    return tx.expense.update({
      where: { id: expenseId },
      data: {
        description: data.description,
        amount: data.amount.toFixed(2),
        category,
        splitType: data.splitType,
        incurredAt: data.incurredAt ? new Date(data.incurredAt) : undefined,
        splits: { create: splits.map((s) => ({ userId: s.userId, amount: s.amount })) },
        payments: { create: payments.map((p) => ({ userId: p.userId, amount: p.amount })) },
      },
      include: expenseInclude,
    });
  });

  await invalidateGroupBalancesCache(groupId);
  return expense;
}

export async function deleteExpenseFromGroup(groupId: string, expenseId: string): Promise<void> {
  const existing = await prisma.expense.findFirst({ where: { id: expenseId, groupId } });
  if (!existing) {
    throw new ExpenseValidationError('Expense not found in this group');
  }

  await prisma.expense.delete({ where: { id: expenseId } });
  await invalidateGroupBalancesCache(groupId);
}

export { expenseInclude };
