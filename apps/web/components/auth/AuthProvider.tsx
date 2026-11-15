'use client';

import type { AuthUser } from '@inventaire/shared';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchMe } from '../../lib/auth';

const AuthContext = createContext<AuthUser | null>(null);

/** Checks the session once the shell is shown; an expired session sends the user to the login page. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        // 401 already redirected; other errors keep the shell usable.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}

/** The signed-in user, or null while the session is being checked. */
export function useCurrentUser(): AuthUser | null {
  return useContext(AuthContext);
}
