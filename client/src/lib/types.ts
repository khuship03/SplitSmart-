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

export type SplitType = 'EQUAL' | 'PERCENTAGE' | 'EXACT' | 'SHARES';

export interface ExpenseSplit {
  id: string;
  expenseId: string;
  userId: string;
  amount: string;
}

export interface ExpensePayment {
  id: string;
  expenseId: string;
  userId: string;
  amount: string;
  user: User;
}

export interface Expense {
  id: string;
  groupId: string;
  description: string;
  amount: string;
  category: string | null;
  splitType: SplitType;
  source: 'MANUAL' | 'PLAID';
  payments: ExpensePayment[];
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
  fromUser: User;
  toUser: User;
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

export interface GroupSpendingInsights {
  month: string;
  total: string;
  byCategory: { category: string; amount: string }[];
  summary: string;
}

export interface PlaidTransaction {
  plaidTransactionId: string;
  name: string;
  amount: number;
  date: string;
  category: string | null;
}

export interface DashboardGroupSummary {
  id: string;
  name: string;
  memberCount: number;
  yourBalance: string;
}

export interface DashboardRecentExpense {
  id: string;
  groupId: string;
  groupName: string;
  description: string;
  amount: string;
  category: string | null;
  incurredAt: string;
}

export interface DashboardPendingSettlement {
  groupId: string;
  groupName: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  amount: string;
}

export interface DashboardData {
  totalOwedToYou: string;
  totalYouOwe: string;
  groups: DashboardGroupSummary[];
  recentExpenses: DashboardRecentExpense[];
  pendingSettlements: DashboardPendingSettlement[];
}
