'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { CircleCheck, Eye, EyeOff, KeyRound, Loader2, ShieldAlert } from 'lucide-react';
import { platformApi, type ActivationInfo } from '@/lib/services/platform-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

/**
 * Workspace-owner activation - the public page the provisioning email points
 * at. Single purpose: prove inbox ownership by opening the link, choose a
 * password, then continue to the normal workspace login (2FA and session
 * rules apply there unchanged - this page never mints a session).
 */
function ActivateInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') || '';

  const [info, setInfo] = useState<ActivationInfo | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [done, setDone] = useState<{ slug: string; name: string; email: string } | null>(null);

  const missingToken = !token;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    platformApi.activation.validate(token)
      .then((valid) => { if (!cancelled) setInfo(valid); })
      .catch((error) => { if (!cancelled) setInvalid(extractApiErrorMessage(error, 'This activation link is invalid or has expired.')); });
    return () => { cancelled = true; };
  }, [token]);

  const mutation = useMutation({
    mutationFn: () => platformApi.activation.consume({ token, password }),
    onSuccess: (result) => setDone({ slug: result.workspace.slug, name: result.workspace.name, email: result.email }),
  });

  const mismatch = confirm.length > 0 && password !== confirm;
  const ready = password.length >= 8 && password === confirm;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white">
            <KeyRound className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">Activate your workspace</h1>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          {missingToken || invalid ? (
            <div className="text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                <ShieldAlert className="h-6 w-6" aria-hidden />
              </span>
              <p className="mt-4 text-sm font-medium">This link no longer works</p>
              <p className="mt-1 text-sm text-muted-foreground">{invalid || 'This activation link is incomplete. Open the link from your email again.'}</p>
              <p className="mt-4 text-xs text-muted-foreground">Ask the person who set up your workspace to send a fresh activation link.</p>
            </div>
          ) : done ? (
            <div className="text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                <CircleCheck className="h-6 w-6" aria-hidden />
              </span>
              <p className="mt-4 text-sm font-medium">{done.name} is yours</p>
              <p className="mt-1 text-sm text-muted-foreground">Your password is set and your email is verified. Sign in to get started.</p>
              <button
                type="button"
                onClick={() => router.push(`/w/${done.slug}/login`)}
                className="mt-5 w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Sign in to {done.name}
              </button>
            </div>
          ) : !info ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Checking link" />
            </div>
          ) : (
            <form onSubmit={(event) => { event.preventDefault(); if (ready && !mutation.isPending) mutation.mutate(); }}>
              <p className="text-sm text-muted-foreground">
                Hi {info.owner.firstName || 'there'} — you&apos;re becoming the owner of{' '}
                <strong className="text-foreground">{info.organization.name}</strong>
                {' '}as <span className="font-mono text-xs">{info.owner.email}</span>. Choose a password to finish.
              </p>

              <label className="mt-5 block">
                <span className="text-xs font-medium">Password</span>
                <span className="relative mt-1.5 block">
                  <input
                    type={show ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 pr-10 text-sm outline-none focus:ring-2 focus:ring-brand-500/40"
                    autoFocus
                  />
                  <button type="button" onClick={() => setShow((value) => !value)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={show ? 'Hide password' : 'Show password'}>
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </span>
                <span className="mt-1 block text-[11px] text-muted-foreground">At least 8 characters.</span>
              </label>

              <label className="mt-3 block">
                <span className="text-xs font-medium">Confirm password</span>
                <input
                  type={show ? 'text' : 'password'}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/40"
                />
                {mismatch ? <span className="mt-1 block text-[11px] text-red-500">Passwords don&apos;t match.</span> : null}
              </label>

              {mutation.isError ? (
                <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-400">
                  {extractApiErrorMessage(mutation.error, 'Activation failed. Try again.')}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={!ready || mutation.isPending}
                className="mt-5 w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:bg-brand-700"
              >
                {mutation.isPending ? 'Activating…' : 'Set password & activate'}
              </button>
              <p className="mt-3 text-center text-[11px] text-muted-foreground">This link works once. You&apos;ll sign in normally right after.</p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

export default function ActivatePage() {
  return (
    <Suspense fallback={null}>
      <ActivateInner />
    </Suspense>
  );
}
