export interface User {
  id: string;
  email: string;
  name: string;
}

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  isAdmin: boolean;
  joinedAt: string;
  user: User;
}

export interface Group {
  id: string;
  name: string;
  createdAt: string;
  members: GroupMember[];
}

export type SplitType = 'EQUAL' | 'PERCENTAGE' | 'EXACT';

export interface ExpenseSplit {
  id: string;
  expenseId: string;
  userId: string;
  amount: string;
}

export interface Expense {
  id: string;
  groupId: string;
  description: string;
  amount: string;
  category: string | null;
  splitType: SplitType;
  source: 'MANUAL' | 'PLAID';
  paidById: string;
  paidBy: User;
  incurredAt: string;
  createdAt: string;
  splits: ExpenseSplit[];
}

export interface Settlement {
  id: string;
  groupId: string;
  fromUserId: string;
  toUserId: string;
  amount: string;
  settledAt: string;
}

export interface NetBalance {
  userId: string;
  amount: string;
}

export interface Transfer {
  fromUserId: string;
  toUserId: string;
  amount: string;
}

export interface GroupBalances {
  netBalances: NetBalance[];
  transfers: Transfer[];
}
