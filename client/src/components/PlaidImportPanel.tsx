import { useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { api, ApiError } from '../lib/api';
import type { GroupMember, PlaidTransaction } from '../lib/types';

interface Props {
  groupId: string;
  members: GroupMember[];
  currentUserId: string;
  onImported: () => void;
}

export function PlaidImportPanel({ groupId, members, currentUserId, onImported }: Props) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);
  const [transactions, setTransactions] = useState<PlaidTransaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .post<{ linkToken: string }>('/api/plaid/link-token')
      .then((res) => setLinkToken(res.linkToken))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to initialize Plaid Link'));
  }, []);

  async function loadTransactions() {
    setLoadingTx(true);
    setError(null);
    try {
      const res = await api.get<{ transactions: PlaidTransaction[] }>('/api/plaid/transactions');
      setTransactions(res.transactions);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load transactions');
    } finally {
      setLoadingTx(false);
    }
  }

  const { open, ready } = usePlaidLink({
    token: linkToken ?? '',
    onSuccess: async (publicToken) => {
      setError(null);
      try {
        await api.post('/api/plaid/exchange-public-token', { publicToken });
        setLinked(true);
        await loadTransactions();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to link account');
      }
    },
  });

  async function handleImport(tx: PlaidTransaction) {
    setImportingId(tx.plaidTransactionId);
    setError(null);
    try {
      await api.post(`/api/plaid/groups/${groupId}/import`, {
        description: tx.name,
        amount: tx.amount,
        category: tx.category ?? undefined,
        incurredAt: new Date(tx.date).toISOString(),
        payments: [{ userId: currentUserId, amount: tx.amount }],
        splitType: 'EQUAL',
        participantIds: members.map((m) => m.userId),
      });
      setTransactions((prev) => prev.filter((t) => t.plaidTransactionId !== tx.plaidTransactionId));
      onImported();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to import transaction');
    } finally {
      setImportingId(null);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-lg font-medium text-slate-900">Import from bank (Plaid Sandbox)</h2>

      {!linked ? (
        <button
          onClick={() => open()}
          disabled={!ready}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Connect bank (Sandbox)
        </button>
      ) : (
        <>
          <button
            onClick={loadTransactions}
            disabled={loadingTx}
            className="mb-3 rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-50"
          >
            {loadingTx ? 'Loading...' : 'Refresh transactions'}
          </button>

          {transactions.length === 0 ? (
            <p className="text-sm text-slate-500">No transactions to import.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {transactions.map((tx) => (
                <li key={tx.plaidTransactionId} className="flex items-center justify-between text-sm">
                  <div>
                    <div className="text-slate-900">{tx.name}</div>
                    <div className="text-slate-500">
                      {tx.date} {tx.category ? `· ${tx.category}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-slate-900">${tx.amount.toFixed(2)}</span>
                    <button
                      onClick={() => handleImport(tx)}
                      disabled={importingId === tx.plaidTransactionId}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50"
                    >
                      {importingId === tx.plaidTransactionId ? 'Importing...' : 'Import'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
