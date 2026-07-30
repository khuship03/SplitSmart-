import { Router } from 'express';
import { z } from 'zod';
import { CountryCode, Products } from 'plaid';
import { plaidClient } from '../lib/plaid';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { createExpenseSchema } from '../lib/expenseSchema';
import { createExpenseInGroup, ExpenseValidationError } from '../lib/expenses';

export const plaidRouter = Router();

plaidRouter.use(requireAuth);

plaidRouter.post('/link-token', async (req, res) => {
  const response = await plaidClient.linkTokenCreate({
    user: { client_user_id: req.userId! },
    client_name: 'SplitSmart',
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: 'en',
  });
  res.json({ linkToken: response.data.link_token });
});

const exchangeSchema = z.object({ publicToken: z.string().min(1) });

plaidRouter.post('/exchange-public-token', async (req, res) => {
  const parsed = exchangeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const exchangeResponse = await plaidClient.itemPublicTokenExchange({
    public_token: parsed.data.publicToken,
  });
  const { access_token: accessToken, item_id: itemId } = exchangeResponse.data;

  let institutionName: string | undefined;
  try {
    const itemResponse = await plaidClient.itemGet({ access_token: accessToken });
    const institutionId = itemResponse.data.item.institution_id;
    if (institutionId) {
      const institutionResponse = await plaidClient.institutionsGetById({
        institution_id: institutionId,
        country_codes: [CountryCode.Us],
      });
      institutionName = institutionResponse.data.institution.name;
    }
  } catch {
    institutionName = undefined;
  }

  const plaidItem = await prisma.plaidItem.upsert({
    where: { itemId },
    create: { userId: req.userId!, itemId, accessToken, institutionName },
    update: { accessToken, institutionName },
  });

  res.status(201).json({ item: { id: plaidItem.id, institutionName: plaidItem.institutionName } });
});

plaidRouter.get('/items', async (req, res) => {
  const items = await prisma.plaidItem.findMany({
    where: { userId: req.userId! },
    select: { id: true, institutionName: true, createdAt: true },
  });
  res.json({ items });
});

plaidRouter.get('/transactions', async (req, res) => {
  const items = await prisma.plaidItem.findMany({ where: { userId: req.userId! } });

  const added: {
    transaction_id: string;
    name: string;
    amount: number;
    date: string;
    personal_finance_category?: { primary?: string } | null;
  }[] = [];

  for (const item of items) {
    let cursor: string | undefined;
    let hasMore = true;
    while (hasMore) {
      const syncResponse = await plaidClient.transactionsSync({
        access_token: item.accessToken,
        cursor,
      });
      added.push(...syncResponse.data.added);
      hasMore = syncResponse.data.has_more;
      cursor = syncResponse.data.next_cursor;
    }
  }

  const transactions = added
    .filter((t) => t.amount > 0) // positive Plaid amount = money out = a spend, not a deposit
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 50)
    .map((t) => ({
      plaidTransactionId: t.transaction_id,
      name: t.name,
      amount: t.amount,
      date: t.date,
      category: t.personal_finance_category?.primary ?? null,
    }));

  res.json({ transactions });
});

plaidRouter.post('/groups/:id/import', async (req, res) => {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: req.params.id, userId: req.userId! } },
  });
  if (!membership) {
    return res.status(403).json({ error: 'Not a member of this group' });
  }

  const parsed = createExpenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const expense = await createExpenseInGroup(req.params.id, parsed.data, 'PLAID');
    res.status(201).json({ expense });
  } catch (err) {
    if (err instanceof ExpenseValidationError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});
