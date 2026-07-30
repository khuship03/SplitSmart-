import { z } from 'zod';

const baseExpenseFields = {
  description: z.string().min(1),
  amount: z.number().positive(),
  category: z.string().optional(),
  incurredAt: z.string().datetime().optional(),
  paidById: z.string().uuid(),
};

export const createExpenseSchema = z.discriminatedUnion('splitType', [
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

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
