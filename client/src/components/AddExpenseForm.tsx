import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import type { GroupMember, SplitType } from '../lib/types';

interface Props {
  groupId: string;
  members: GroupMember[];
  currentUserId: string;
  onCreated: () => void;
}

export function AddExpenseForm({ groupId, members, currentUserId, onCreated }: Props) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidById, setPaidById] = useState(currentUserId);
  const [splitType, setSplitType] = useState<SplitType>('EQUAL');
  const [included, setIncluded] = useState<Set<string>>(new Set(members.map((m) => m.userId)));
  const [percentages, setPercentages] = useState<Record<string, string>>({});
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const memberIdsKey = members.map((m) => m.userId).sort().join(',');
  useEffect(() => {
    setIncluded(new Set(members.map((m) => m.userId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberIdsKey]);

  function toggleIncluded(userId: string) {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function resetForm() {
    setDescription('');
    setAmount('');
    setPaidById(currentUserId);
    setSplitType('EQUAL');
    setIncluded(new Set(members.map((m) => m.userId)));
    setPercentages({});
    setExactAmounts({});
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const numericAmount = Number(amount);
    if (!description.trim() || !(numericAmount > 0)) {
      setError('Enter a description and a positive amount');
      return;
    }

    let payload: Record<string, unknown>;
    if (splitType === 'EQUAL') {
      const participantIds = Array.from(included);
      if (participantIds.length === 0) {
        setError('Select at least one participant');
        return;
      }
      payload = { participantIds };
    } else if (splitType === 'PERCENTAGE') {
      const participants = members
        .filter((m) => Number(percentages[m.userId]) > 0)
        .map((m) => ({ userId: m.userId, percentage: Number(percentages[m.userId]) }));
      if (participants.length === 0) {
        setError('Enter at least one percentage');
        return;
      }
      payload = { participants };
    } else {
      const participants = members
        .filter((m) => Number(exactAmounts[m.userId]) > 0)
        .map((m) => ({ userId: m.userId, amount: Number(exactAmounts[m.userId]) }));
      if (participants.length === 0) {
        setError('Enter at least one exact amount');
        return;
      }
      payload = { participants };
    }

    setSubmitting(true);
    try {
      await api.post(`/api/groups/${groupId}/expenses`, {
        description: description.trim(),
        amount: numericAmount,
        paidById,
        splitType,
        ...payload,
      });
      resetForm();
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add expense');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-medium text-slate-900">Add an expense</h2>

      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="col-span-2 rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
        />
        <input
          type="number"
          step="0.01"
          min="0.01"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
        />
        <select
          value={paidById}
          onChange={(e) => setPaidById(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
        >
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              Paid by {m.user.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        {(['EQUAL', 'PERCENTAGE', 'EXACT'] as SplitType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setSplitType(type)}
            className={`rounded-md px-3 py-1 text-sm ${
              splitType === type ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {type === 'EQUAL' ? 'Split equally' : type === 'PERCENTAGE' ? 'By percentage' : 'Exact amounts'}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {members.map((m) => (
          <div key={m.userId} className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-700">{m.user.name}</span>
            {splitType === 'EQUAL' && (
              <input
                type="checkbox"
                checked={included.has(m.userId)}
                onChange={() => toggleIncluded(m.userId)}
                className="h-4 w-4"
              />
            )}
            {splitType === 'PERCENTAGE' && (
              <input
                type="number"
                min="0"
                max="100"
                placeholder="%"
                value={percentages[m.userId] ?? ''}
                onChange={(e) => setPercentages((prev) => ({ ...prev, [m.userId]: e.target.value }))}
                className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right focus:border-slate-500 focus:outline-none"
              />
            )}
            {splitType === 'EXACT' && (
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="$"
                value={exactAmounts[m.userId] ?? ''}
                onChange={(e) => setExactAmounts((prev) => ({ ...prev, [m.userId]: e.target.value }))}
                className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right focus:border-slate-500 focus:outline-none"
              />
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-slate-900 px-3 py-2 text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {submitting ? 'Adding...' : 'Add expense'}
      </button>
    </form>
  );
}
