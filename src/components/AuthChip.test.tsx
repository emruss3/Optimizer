import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const authMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ supabase: { auth: authMock } }));

import AuthChip from './AuthChip';

describe('AuthChip — the persistence gate opener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.getSession.mockResolvedValue({ data: { session: null } });
    authMock.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });

  it('signs in with email + password and closes on success', async () => {
    authMock.signInWithPassword.mockResolvedValue({ error: null });
    render(<AuthChip />);
    fireEvent.click(screen.getByTestId('auth-sign-in-button'));
    fireEvent.change(screen.getByTestId('auth-email'), { target: { value: 'dev@example.com' } });
    fireEvent.change(screen.getByTestId('auth-password'), { target: { value: 'hunter22' } });
    await act(async () => {
      fireEvent.submit(screen.getByTestId('auth-popover'));
    });
    expect(authMock.signInWithPassword).toHaveBeenCalledWith({
      email: 'dev@example.com',
      password: 'hunter22',
    });
    expect(screen.queryByTestId('auth-popover')).toBeNull();
  });

  it('surfaces auth errors verbatim — no swallowed failures', async () => {
    authMock.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    render(<AuthChip />);
    fireEvent.click(screen.getByTestId('auth-sign-in-button'));
    fireEvent.change(screen.getByTestId('auth-email'), { target: { value: 'dev@example.com' } });
    fireEvent.change(screen.getByTestId('auth-password'), { target: { value: 'wrong' } });
    await act(async () => {
      fireEvent.submit(screen.getByTestId('auth-popover'));
    });
    expect(screen.getByTestId('auth-error').textContent).toBe('Invalid login credentials');
  });

  it('tells the truth when sign-up requires email confirmation', async () => {
    authMock.signUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null });
    render(<AuthChip />);
    fireEvent.click(screen.getByTestId('auth-sign-in-button'));
    fireEvent.click(screen.getByTestId('auth-mode-toggle'));
    fireEvent.change(screen.getByTestId('auth-email'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByTestId('auth-password'), { target: { value: 'hunter22' } });
    await act(async () => {
      fireEvent.submit(screen.getByTestId('auth-popover'));
    });
    expect(authMock.signUp).toHaveBeenCalled();
    expect(screen.getByTestId('auth-notice').textContent).toMatch(/confirm via the email/);
  });

  it('shows the signed-in identity and signs out', async () => {
    authMock.getSession.mockResolvedValue({
      data: { session: { user: { email: 'dev@example.com' } } },
    });
    authMock.signOut.mockResolvedValue({ error: null });
    render(<AuthChip />);
    await waitFor(() => expect(screen.getByTestId('auth-chip-signed-in')).toBeTruthy());
    expect(screen.getByText('dev@example.com')).toBeTruthy();
    fireEvent.click(screen.getByTestId('auth-sign-out'));
    expect(authMock.signOut).toHaveBeenCalled();
  });
});
