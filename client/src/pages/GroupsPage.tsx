import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import type { Group } from '../lib/types';

export function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [newGroupName, setNewGroupName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadGroups();
  }, []);

  async function loadGroups() {
    setLoading(true);
    try {
      const res = await api.get<{ groups: Group[] }>('/api/groups');
      setGroups(res.groups);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api.post('/api/groups', { name: newGroupName.trim() });
      setNewGroupName('');
      await loadGroups();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create group');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Your groups</h1>

      <form onSubmit={handleCreate} className="mb-6 flex gap-2">
        <input
          type="text"
          placeholder="New group name"
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={creating}
          className="rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'Create group'}
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : groups.length === 0 ? (
        <p className="text-slate-500">You're not in any groups yet. Create one above.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                to={`/groups/${group.id}`}
                className="block rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-slate-400"
              >
                <div className="font-medium text-slate-900">{group.name}</div>
                <div className="text-sm text-slate-500">{group.members.length} member(s)</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
