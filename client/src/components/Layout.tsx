import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { NotificationsToggle } from './NotificationsToggle';

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link to="/dashboard" className="text-lg font-semibold text-slate-900">
              SplitSmart
            </Link>
            <nav className="flex gap-4 text-sm text-slate-600">
              <Link to="/dashboard" className="hover:text-slate-900">
                Dashboard
              </Link>
              <Link to="/groups" className="hover:text-slate-900">
                Groups
              </Link>
            </nav>
          </div>
          {user && (
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <NotificationsToggle />
              <span>{user.name}</span>
              <button
                onClick={handleLogout}
                className="rounded-md border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-100"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
