'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { PasswordForm } from '../../../../components/account/PasswordForm';
import { useCurrentUser } from '../../../../components/auth/AuthProvider';

export default function ComptePage() {
  const user = useCurrentUser();
  return (
    <main className="flex flex-col gap-4">
      <Link
        href="/plus"
        className="tap-target text-indigo-mid inline-flex items-center gap-1 font-bold"
      >
        <ChevronLeft size={18} aria-hidden="true" />
        Plus
      </Link>
      <h1 className="text-title">Compte</h1>
      {user ? (
        <dl className="flex flex-col gap-1">
          <div className="flex gap-2">
            <dt className="text-label">Pseudo</dt>
            <dd>{user.username}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-label">Rôle</dt>
            <dd>{user.role === 'admin' ? 'Administrateur' : 'Membre'}</dd>
          </div>
        </dl>
      ) : null}
      <h2 className="text-label">Changer le mot de passe</h2>
      <PasswordForm />
    </main>
  );
}
