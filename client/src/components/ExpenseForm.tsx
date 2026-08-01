import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import type { Expense, GroupMember, SplitType } from '../lib/types';

interface Props {
  groupId: string;
  members: GroupMember[];
  currentUserId: string;
  expense?: Expense;
  onSaved: () => void;
  onCancel?: () => void;
}

const SPLIT_LABELS: Record<SplitType, string> = {
  EQUAL: 'Split equally',
  PERCENTAGE: 'By percentage',
  EXACT: 'Exact amounts',
  SHARES: 'By shares',
};

export function ExpenseForm({ groupId, members, currentUserId, expense, onSaved, onCancel }: Props) {
  const isEditing = Boolean(expense);

  const [description, setDescription] = useState(expense?.description ?? '');
  const [amount, setAmount] = useState(expense?.amount ?? '');
  const [splitType, setSplitType] = useState<SplitType>(expense?.splitType ?? 'EQUAL');

  const [multiPayer, setMultiPayer] = useState((expense?.payments.length ?? 0) > 1);
  const [singlePayerId, setSinglePayerId] = useState(expense?.payments[0]?.userId ?? currentUserId);
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>(() =>
    expense ? Object.fromEntries(expense.payments.map((p) => [p.userId, p.amount])) : {}
  );

  const [included, setIncluded] = useState<Set<string>>(
    () => new Set(expense?.splits.map((s) => s.userId) ?? members.map((m) => m.userId))
  );
  const [percentages, setPercentages] = useState<Record<string, string>>(() =>
    expense && expense.splitType === 'PERCENTAGE'
      ? Object.fromEntries(
          expense.splits.map((s) => [s.userId, ((Number(s.amount) / Number(expense.amount)) * 100).toFixed(2)])
        )
      : {}
  );
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>(() =>
    expense && expense.splitType === 'EXACT' ? Object.fromEntries(expense.splits.map((s) => [s.userId, s.amount])) : {}
  );
  const [shares, setShares] = useState<Record<string, string>>(() =>
    expense && expense.splitType === 'SHARES' ? Object.fromEntries(expense.splits.map((s) => [s.userId, s.amount])) : {}
  );

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const memberIdsKey = members.map((m) => m.userId).sort().join(',');
  useEffect(() => {
    if (isEditing) return;
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
    setSplitType('EQUAL');
    setMultiPayer(false);
    setSinglePayerId(currentUserId);
    setPaymentAmounts({});
    setIncluded(new Set(members.map((m) => m.userId)));
    setPercentages({});
    setExactAmounts({});
    setShares({});
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const numericAmount = Number(amount);
    if (!description.trim() || !(numericAmount > 0)) {
      setError('Enter a description and a positive amount');
      return;
    }

    const payments = multiPayer
      ? members
          .filter((m) => Number(paymentAmounts[m.userId]) > 0)
          .map((m) => ({ userId: m.userId, amount: Number(paymentAmounts[m.userId]) }))
      : [{ userId: singlePayerId, amount: numericAmount }];

    if (payments.length === 0) {
      setError('Enter at least one payer amount');
      return;
    }

    let splitPayload: Record<string, unknown>;
    if (splitType === 'EQUAL') {
      const participantIds = Array.from(included);
      if (participantIds.length === 0) {
        setError('Select at least one participant');
        return;
      }
      splitPayload = { participantIds };
    } else if (splitType === 'PERCENTAGE') {
      const participants = members
        .filter((m) => Number(percentages[m.userId]) > 0)
        .map((m) => ({ userId: m.userId, percentage: Number(percentages[m.userId]) }));
      if (participants.length === 0) {
        setError('Enter at least one percentage');
        return;
      }
      splitPayload = { participants };
    } else if (splitType === 'EXACT') {
      const participants = members
        .filter((m) => Number(exactAmounts[m.userId]) > 0)
        .map((m) => ({ userId: m.userId, amount: Number(exactAmounts[m.userId]) }));
      if (participants.length === 0) {
        setError('Enter at least one exact amount');
        return;
      }
      splitPayload = { participants };
    } else {
      const participants = members
        .filter((m) => Number(shares[m.userId]) > 0)
        .map((m) => ({ userId: m.userId, shares: Number(shares[m.userId]) }));
      if (participants.length === 0) {
        setError('Enter at least one share value');
        return;
      }
      splitPayload = { participants };
    }

    setSubmitting(true);
    try {
      const body = {
        description: description.trim(),
        amount: numericAmount,
        splitType,
        payments,
        ...splitPayload,
      };
      if (isEditing && expense) {
        await api.put(`/api/groups/${groupId}/expenses/${expense.id}`, body);
      } else {
        await api.post(`/api/groups/${groupId}/expenses`, body);
        resetForm();
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${isEditing ? 'update' : 'add'} expense`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-medium text-slate-900">{isEditing ? 'Edit expense' : 'Add an expense'}</h2>

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
        {!multiPayer && (
          <select
            value={singlePayerId}
            onChange={(e) => setSinglePayerId(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
          >
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                Paid by {m.user.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <button
        type="button"
        onClick={() => setMultiPayer((v) => !v)}
        className="self-start text-xs text-slate-500 underline hover:text-slate-700"
      >
        {multiPayer ? 'Use a single payer instead' : '+ Split the payment between multiple people'}
      </button>

      {multiPayer && (
        <div className="flex flex-col gap-2 rounded-md bg-slate-50 p-3">
          <span className="text-xs font-medium text-slate-500">Who paid what</span>
          {members.map((m) => (
            <div key={m.userId} className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-700">{m.user.name}</span>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="$"
                value={paymentAmounts[m.userId] ?? ''}
                onChange={(e) => setPaymentAmounts((prev) => ({ ...prev, [m.userId]: e.target.value }))}
                className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right focus:border-slate-500 focus:outline-none"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(Object.keys(SPLIT_LABELS) as SplitType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setSplitType(type)}
            className={`rounded-md px-3 py-1 text-sm ${
              splitType === type ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {SPLIT_LABELS[type]}
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
            {splitType === 'SHARES' && (
              <input
                type="number"
                min="0"
                step="1"
                placeholder="shares"
                value={shares[m.userId] ?? ''}
                onChange={(e) => setShares((prev) => ({ ...prev, [m.userId]: e.target.value }))}
                className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right focus:border-slate-500 focus:outline-none"
              />
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-md bg-slate-900 px-3 py-2 text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {submitting ? 'Saving...' : isEditing ? 'Save changes' : 'Add expense'}
        </button>
        {isEditing && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
