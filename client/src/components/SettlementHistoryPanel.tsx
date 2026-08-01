import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { Settlement } from '../lib/types';

interface Props {
  groupId: string;
  refreshKey: number;
}

export function SettlementHistoryPanel({ groupId, refreshKey }: Props) {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .get<{ settlements: Settlement[] }>(`/api/groups/${groupId}/settlements`)
      .then((res) => setSettlements(res.settlements))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load settlement history'))
      .finally(() => setLoading(false));
  }, [groupId, refreshKey]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-lg font-medium text-slate-900">Settlement history</h2>
      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : settlements.length === 0 ? (
        <p className="text-sm text-slate-500">No settlements recorded yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {settlements.map((s) => (
            <li key={s.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-700">
                {s.fromUser.name} paid {s.toUser.name}
              </span>
              <div className="flex items-center gap-3">
                <span className="font-medium text-slate-900">${s.amount}</span>
                <span className="text-xs text-slate-400">{new Date(s.settledAt).toLocaleDateString()}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
