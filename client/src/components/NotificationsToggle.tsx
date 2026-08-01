import { useEffect, useState } from 'react';
import {
  disablePushNotifications,
  enablePushNotifications,
  getExistingSubscription,
  isPushSupported,
} from '../lib/push';

export function NotificationsToggle() {
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPushSupported()) return;
    getExistingSubscription().then((sub) => setSubscribed(Boolean(sub)));
  }, []);

  if (!isPushSupported()) return null;

  async function handleToggle() {
    setBusy(true);
    setError(null);
    try {
      if (subscribed) {
        await disablePushNotifications();
        setSubscribed(false);
      } else {
        await enablePushNotifications();
        setSubscribed(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update notification settings');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleToggle}
        disabled={busy}
        title={error ?? undefined}
        className={`rounded-md border px-3 py-1 text-xs disabled:opacity-50 ${
          subscribed
            ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
            : 'border-slate-300 text-slate-700 hover:bg-slate-100'
        }`}
      >
        {busy ? '...' : subscribed ? 'Notifications on' : 'Enable notifications'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
