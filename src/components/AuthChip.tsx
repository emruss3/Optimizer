import React, { useEffect, useRef, useState } from 'react';
import { LogIn, LogOut, UserCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

/**
 * Sign-in chip (P1-7): the only thing standing between a user and the live
 * site_plans persistence (per-user RLS, applied 2026-07-20) was a way to
 * authenticate. Email + password against Supabase auth; every failure is
 * surfaced verbatim (including "Email not confirmed" when the project
 * requires confirmation) — no swallowed errors, no fake success states.
 */
const AuthChip: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }: { data: { session: { user?: { email?: string } } | null } }) => {
      if (!cancelled) setSessionEmail(data.session?.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event: string, session: { user?: { email?: string } } | null) => {
        setSessionEmail(session?.user?.email ?? null);
      }
    );
    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (!supabase) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'sign_in') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) {
          setError(err.message);
        } else {
          setOpen(false);
          setPassword('');
        }
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) {
          setError(err.message);
        } else if (data?.user && !data?.session) {
          // Email confirmation is on for this project — say so honestly.
          setNotice('Account created — confirm via the email we sent, then sign in.');
          setMode('sign_in');
        } else {
          setOpen(false);
          setPassword('');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (sessionEmail) {
    return (
      <div className="flex items-center gap-1.5" data-testid="auth-chip-signed-in">
        <span
          className="flex items-center gap-1.5 text-sm text-gray-700 max-w-[180px] truncate"
          title={`Signed in as ${sessionEmail} — saved plans are private to this account`}
        >
          <UserCircle2 className="w-4 h-4 text-green-600" />
          <span className="hidden md:inline truncate">{sessionEmail}</span>
        </span>
        <button
          onClick={() => supabase.auth.signOut()}
          className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Sign out"
          data-testid="auth-sign-out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={popRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center space-x-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors font-medium"
        title="Sign in to save schemes — saved plans are private to your account"
        data-testid="auth-sign-in-button"
      >
        <LogIn className="w-4 h-4" />
        <span className="text-sm hidden md:inline">Sign in</span>
      </button>
      {open && (
        <form
          onSubmit={submit}
          className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-50 space-y-2"
          data-testid="auth-popover"
        >
          <div className="text-xs text-gray-500">
            {mode === 'sign_in' ? 'Sign in to save and revisit schemes.' : 'Create an account — plans stay private to it.'}
          </div>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm"
            data-testid="auth-email"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm"
            data-testid="auth-password"
          />
          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1" data-testid="auth-error">
              {error}
            </div>
          )}
          {notice && (
            <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1" data-testid="auth-notice">
              {notice}
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded px-3 py-1.5 text-sm font-medium"
            data-testid="auth-submit"
          >
            {busy ? 'Working…' : mode === 'sign_in' ? 'Sign in' : 'Create account'}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode(m => (m === 'sign_in' ? 'sign_up' : 'sign_in'));
              setError(null);
              setNotice(null);
            }}
            className="w-full text-xs text-gray-500 hover:text-gray-700"
            data-testid="auth-mode-toggle"
          >
            {mode === 'sign_in' ? 'No account? Create one' : 'Have an account? Sign in'}
          </button>
        </form>
      )}
    </div>
  );
};

export default AuthChip;
