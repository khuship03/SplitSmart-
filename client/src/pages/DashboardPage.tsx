import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import type { DashboardData } from '../lib/types';

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DashboardData>('/api/dashboard')
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-slate-500">Loading...</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">You are owed</div>
          <div className="text-2xl font-semibold text-emerald-600">${data.totalOwedToYou}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">You owe</div>
          <div className="text-2xl font-semibold text-red-600">${data.totalYouOwe}</div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-medium text-slate-900">Your groups</h2>
        {data.groups.length === 0 ? (
          <p className="text-sm text-slate-500">
            You're not in any groups yet.{' '}
            <Link to="/groups" className="underline">
              Create one
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.groups.map((g) => {
              const cents = Number(g.yourBalance);
              return (
                <li key={g.id}>
                  <Link
                    to={`/groups/${g.id}`}
                    className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 hover:border-slate-300"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900">{g.name}</div>
                      <div className="text-xs text-slate-500">{g.memberCount} member(s)</div>
                    </div>
                    <span
                      className={`text-sm font-medium ${
                        cents > 0 ? 'text-emerald-600' : cents < 0 ? 'text-red-600' : 'text-slate-400'
                      }`}
                    >
                      {cents > 0 ? `+$${g.yourBalance}` : cents < 0 ? `-$${(-cents).toFixed(2)}` : 'settled up'}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-medium text-slate-900">Pending settlements</h2>
        {data.pendingSettlements.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing pending — you're all settled up.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.pendingSettlements.map((s, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">
                  {s.fromUserName} owes {s.toUserName} in{' '}
                  <Link to={`/groups/${s.groupId}`} className="underline">
                    {s.groupName}
                  </Link>
                </span>
                <span className="font-medium text-slate-900">${s.amount}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-medium text-slate-900">Recent expenses</h2>
        {data.recentExpenses.length === 0 ? (
          <p className="text-sm text-slate-500">No expenses yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.recentExpenses.map((e) => (
              <li key={e.id} className="flex items-center justify-between text-sm">
                <div>
                  <div className="text-slate-900">{e.description}</div>
                  <div className="text-xs text-slate-500">
                    <Link to={`/groups/${e.groupId}`} className="underline">
                      {e.groupName}
                    </Link>
                    {e.category ? ` · ${e.category}` : ''}
                  </div>
                </div>
                <span className="font-medium text-slate-900">${e.amount}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
