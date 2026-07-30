import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import type { Expense, Group, GroupBalances } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { AddExpenseForm } from '../components/AddExpenseForm';
import { BalancesPanel } from '../components/BalancesPanel';

export function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balances, setBalances] = useState<GroupBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memberEmail, setMemberEmail] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!id) return;
    try {
      const [groupRes, expensesRes, balancesRes] = await Promise.all([
        api.get<{ group: Group }>(`/api/groups/${id}`),
        api.get<{ expenses: Expense[] }>(`/api/groups/${id}/expenses`),
        api.get<GroupBalances>(`/api/groups/${id}/balances`),
      ]);
      setGroup(groupRes.group);
      setExpenses(expensesRes.expenses);
      setBalances(balancesRes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load group');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleAddMember(e: FormEvent) {
    e.preventDefault();
    if (!id || !memberEmail.trim()) return;
    setAddingMember(true);
    setMemberError(null);
    try {
      await api.post(`/api/groups/${id}/members`, { email: memberEmail.trim() });
      setMemberEmail('');
      await loadAll();
    } catch (err) {
      setMemberError(err instanceof ApiError ? err.message : 'Failed to add member');
    } finally {
      setAddingMember(false);
    }
  }

  if (loading) return <p className="text-slate-500">Loading...</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!group || !user) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/groups" className="text-sm text-slate-500 hover:underline">
          &larr; All groups
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{group.name}</h1>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-medium text-slate-900">Members</h2>
        <ul className="mb-3 flex flex-wrap gap-2">
          {group.members.map((m) => (
            <li key={m.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              {m.user.name}
              {m.isAdmin && <span className="ml-1 text-xs text-slate-400">(admin)</span>}
            </li>
          ))}
        </ul>
        <form onSubmit={handleAddMember} className="flex gap-2">
          <input
            type="email"
            placeholder="Add member by email"
            value={memberEmail}
            onChange={(e) => setMemberEmail(e.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={addingMember}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-50"
          >
            {addingMember ? 'Adding...' : 'Add'}
          </button>
        </form>
        {memberError && <p className="mt-2 text-sm text-red-600">{memberError}</p>}
      </div>

      {balances && (
        <BalancesPanel groupId={group.id} balances={balances} members={group.members} onSettled={loadAll} />
      )}

      <AddExpenseForm groupId={group.id} members={group.members} currentUserId={user.id} onCreated={loadAll} />

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-medium text-slate-900">Expenses</h2>
        {expenses.length === 0 ? (
          <p className="text-sm text-slate-500">No expenses yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {expenses.map((exp) => (
              <li key={exp.id} className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm">
                <div>
                  <div className="font-medium text-slate-900">{exp.description}</div>
                  <div className="text-slate-500">
                    Paid by {exp.paidBy.name} &middot; {exp.splitType.toLowerCase()} split
                    {exp.category ? ` · ${exp.category}` : ''}
                  </div>
                </div>
                <div className="font-medium text-slate-900">${exp.amount}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
