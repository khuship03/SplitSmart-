import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { GroupSpendingInsights } from '../lib/types';

interface Props {
  groupId: string;
  refreshKey: number;
}

export function InsightsPanel({ groupId, refreshKey }: Props) {
  const [insights, setInsights] = useState<GroupSpendingInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .get<GroupSpendingInsights>(`/api/groups/${groupId}/insights`)
      .then(setInsights)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load insights'))
      .finally(() => setLoading(false));
  }, [groupId, refreshKey]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-lg font-medium text-slate-900">Spending insights</h2>

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : insights ? (
        <>
          <p className="mb-3 text-sm text-slate-700">{insights.summary}</p>
          <div className="mb-2 text-sm text-slate-500">
            {insights.month} total: <span className="font-medium text-slate-900">${insights.total}</span>
          </div>
          {insights.byCategory.length > 0 && (
            <ul className="flex flex-col gap-1">
              {insights.byCategory.map((c) => (
                <li key={c.category} className="flex justify-between text-sm">
                  <span className="text-slate-600">{c.category}</span>
                  <span className="text-slate-900">${c.amount}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
