'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { useAuth } from '@/components/auth/AuthContext';

const PROTECTED_PREFIX = '/app';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loggedIn, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!loggedIn && pathname?.startsWith(PROTECTED_PREFIX)) {
      const dest = encodeURIComponent(pathname);
      router.replace(`/login?next=${dest}`);
    }
  }, [loggedIn, loading, pathname, router]);

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-20">
        <div className="card p-6">
          <div className="h-4 w-1/2 animate-pulse rounded bg-neutral-200" />
          <div className="mt-4 h-4 w-3/4 animate-pulse rounded bg-neutral-100" />
          <div className="mt-3 h-4 w-5/6 animate-pulse rounded bg-neutral-100" />
        </div>
      </main>
    );
  }
  if (!loggedIn) return null;
  return <AppShell>{children}</AppShell>;
}
