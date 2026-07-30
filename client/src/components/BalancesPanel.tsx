import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { GroupBalances, GroupMember } from '../lib/types';

interface Props {
  groupId: string;
  balances: GroupBalances;
  members: GroupMember[];
  onSettled: () => void;
}

function nameFor(members: GroupMember[], userId: string) {
  return members.find((m) => m.userId === userId)?.user.name ?? 'Unknown';
}

export function BalancesPanel({ groupId, balances, members, onSettled }: Props) {
  const [settlingKey, setSettlingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSettle(fromUserId: string, toUserId: string, amount: string) {
    const key = `${fromUserId}-${toUserId}`;
    setSettlingKey(key);
    setError(null);
    try {
      await api.post(`/api/groups/${groupId}/settlements`, {
        fromUserId,
        toUserId,
        amount: Number(amount),
      });
      onSettled();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to record settlement');
    } finally {
      setSettlingKey(null);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-lg font-medium text-slate-900">Balances</h2>

      <ul className="mb-4 flex flex-col gap-1 text-sm">
        {balances.netBalances.map((b) => {
          const cents = Number(b.amount);
          return (
            <li key={b.userId} className="flex justify-between">
              <span className="text-slate-700">{nameFor(members, b.userId)}</span>
              <span className={cents > 0 ? 'text-emerald-600' : cents < 0 ? 'text-red-600' : 'text-slate-400'}>
                {cents > 0 ? `is owed $${b.amount}` : cents < 0 ? `owes $${(-cents).toFixed(2)}` : 'settled up'}
              </span>
            </li>
          );
        })}
      </ul>

      <h3 className="mb-2 text-sm font-medium text-slate-900">Suggested settlements</h3>
      {balances.transfers.length === 0 ? (
        <p className="text-sm text-slate-500">Everyone's settled up.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {balances.transfers.map((t) => {
            const key = `${t.fromUserId}-${t.toUserId}`;
            return (
              <li key={key} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">
                  {nameFor(members, t.fromUserId)} owes {nameFor(members, t.toUserId)}{' '}
                  <span className="font-medium">${t.amount}</span>
                </span>
                <button
                  onClick={() => handleSettle(t.fromUserId, t.toUserId, t.amount)}
                  disabled={settlingKey === key}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50"
                >
                  {settlingKey === key ? 'Recording...' : 'Mark settled'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
