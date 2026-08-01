import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import type { Expense, Group, GroupBalances } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { ExpenseForm } from '../components/ExpenseForm';
import { BalancesPanel } from '../components/BalancesPanel';
import { PlaidImportPanel } from '../components/PlaidImportPanel';
import { InsightsPanel } from '../components/InsightsPanel';
import { SettlementHistoryPanel } from '../components/SettlementHistoryPanel';

export function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balances, setBalances] = useState<GroupBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memberEmail, setMemberEmail] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [groupActionError, setGroupActionError] = useState<string | null>(null);

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
      setRefreshKey((k) => k + 1);
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

  async function handleRemoveMember(targetUserId: string, targetName: string) {
    if (!id) return;
    if (!window.confirm(`Remove ${targetName} from this group?`)) return;
    setGroupActionError(null);
    try {
      await api.delete(`/api/groups/${id}/members/${targetUserId}`);
      await loadAll();
    } catch (err) {
      setGroupActionError(err instanceof ApiError ? err.message : 'Failed to remove member');
    }
  }

  async function handleLeaveGroup() {
    if (!id || !user) return;
    if (!window.confirm('Leave this group?')) return;
    setGroupActionError(null);
    try {
      await api.delete(`/api/groups/${id}/members/${user.id}`);
      navigate('/groups');
    } catch (err) {
      setGroupActionError(err instanceof ApiError ? err.message : 'Failed to leave group');
    }
  }

  async function handleDeleteGroup() {
    if (!id) return;
    if (!window.confirm('Delete this group permanently? This cannot be undone.')) return;
    setGroupActionError(null);
    try {
      await api.delete(`/api/groups/${id}`);
      navigate('/groups');
    } catch (err) {
      setGroupActionError(err instanceof ApiError ? err.message : 'Failed to delete group');
    }
  }

  async function handleDeleteExpense(expenseId: string) {
    if (!id) return;
    if (!window.confirm('Delete this expense?')) return;
    setDeletingExpenseId(expenseId);
    try {
      await api.delete(`/api/groups/${id}/expenses/${expenseId}`);
      await loadAll();
    } catch (err) {
      setGroupActionError(err instanceof ApiError ? err.message : 'Failed to delete expense');
    } finally {
      setDeletingExpenseId(null);
    }
  }

  if (loading) return <p className="text-slate-500">Loading...</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!group || !user) return null;

  const myMembership = group.members.find((m) => m.userId === user.id);
  const isAdmin = myMembership?.isAdmin ?? false;
  const editingExpense = editingExpenseId ? expenses.find((e) => e.id === editingExpenseId) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <Link to="/groups" className="text-sm text-slate-500 hover:underline">
            &larr; All groups
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{group.name}</h1>
        </div>
        <div className="flex gap-2">
          {isAdmin ? (
            <button
              onClick={handleDeleteGroup}
              className="rounded-md border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
            >
              Delete group
            </button>
          ) : (
            <button
              onClick={handleLeaveGroup}
              className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
            >
              Leave group
            </button>
          )}
        </div>
      </div>

      {groupActionError && <p className="text-sm text-red-600">{groupActionError}</p>}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-medium text-slate-900">Members</h2>
        <ul className="mb-3 flex flex-wrap gap-2">
          {group.members.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-2 rounded-full bg-slate-100 py-1 pl-3 pr-2 text-sm text-slate-700"
            >
              {m.user.name}
              {m.isAdmin && <span className="text-xs text-slate-400">(admin)</span>}
              {isAdmin && !m.isAdmin && (
                <button
                  onClick={() => handleRemoveMember(m.userId, m.user.name)}
                  className="text-xs text-slate-400 hover:text-red-600"
                  title="Remove member"
                >
                  &times;
                </button>
              )}
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

      {editingExpense ? (
        <ExpenseForm
          key={editingExpense.id}
          groupId={group.id}
          members={group.members}
          currentUserId={user.id}
          expense={editingExpense}
          onSaved={() => {
            setEditingExpenseId(null);
            loadAll();
          }}
          onCancel={() => setEditingExpenseId(null)}
        />
      ) : (
        <ExpenseForm key="new" groupId={group.id} members={group.members} currentUserId={user.id} onSaved={loadAll} />
      )}

      <PlaidImportPanel groupId={group.id} members={group.members} currentUserId={user.id} onImported={loadAll} />

      <InsightsPanel groupId={group.id} refreshKey={refreshKey} />

      <SettlementHistoryPanel groupId={group.id} refreshKey={refreshKey} />

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
                    Paid by{' '}
                    {exp.payments.length === 1
                      ? exp.payments[0].user.name
                      : exp.payments.map((p) => p.user.name).join(', ')}{' '}
                    &middot; {exp.splitType.toLowerCase()} split
                    {exp.category ? ` · ${exp.category}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium text-slate-900">${exp.amount}</span>
                  <button
                    onClick={() => setEditingExpenseId(exp.id)}
                    className="text-xs text-slate-400 hover:text-slate-700"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteExpense(exp.id)}
                    disabled={deletingExpenseId === exp.id}
                    className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50"
                  >
                    {deletingExpenseId === exp.id ? '...' : 'Delete'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
