import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signup(email, password, name);
      navigate('/groups');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to sign up');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="mb-6 text-center text-2xl font-semibold text-slate-900">Create your account</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="text"
          required
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
        />
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-slate-900 px-3 py-2 text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {submitting ? 'Creating account...' : 'Sign up'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-slate-900 underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
