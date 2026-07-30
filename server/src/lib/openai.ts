import OpenAI from 'openai';

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const EXPENSE_CATEGORIES = [
  'Food & Drink',
  'Groceries',
  'Transportation',
  'Travel',
  'Entertainment',
  'Utilities',
  'Rent',
  'Shopping',
  'Health',
  'Other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export async function categorizeExpense(description: string): Promise<ExpenseCategory> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 10,
      messages: [
        {
          role: 'system',
          content: `Classify the expense description into exactly one of these categories: ${EXPENSE_CATEGORIES.join(
            ', '
          )}. Respond with only the category name, nothing else.`,
        },
        { role: 'user', content: description },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim().toLowerCase();
    return EXPENSE_CATEGORIES.find((c) => c.toLowerCase() === raw) ?? 'Other';
  } catch (err) {
    console.error('OpenAI categorization failed:', (err as Error).message);
    return 'Other';
  }
}

export interface SpendingSummaryInput {
  month: string;
  totalUsd: string;
  byCategory: { category: string; amountUsd: string }[];
}

export async function generateSpendingInsights(input: SpendingSummaryInput): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      max_tokens: 150,
      messages: [
        {
          role: 'system',
          content:
            "You are a concise personal-finance assistant. Given a group's monthly spending breakdown " +
            '(amounts in US dollars), write a 2-3 sentence plain-text summary highlighting the total spend ' +
            '(formatted as $X.XX), the top category, and one actionable observation. No markdown, no bullet points.',
        },
        { role: 'user', content: JSON.stringify(input) },
      ],
    });
    return response.choices[0]?.message?.content?.trim() ?? 'No insights available.';
  } catch (err) {
    console.error('OpenAI insights failed:', (err as Error).message);
    return 'Insights are temporarily unavailable.';
  }
}
