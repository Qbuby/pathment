'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { navigationConfig } from '@/lib/config/navigation';
import { usePermissions } from '@/lib/hooks/usePermissions';

/**
 * Admin landing. Full admins go to the dashboard; an org/program sub-role admin
 * is routed to the first admin section they actually have permission for (so
 * they never land on a page they can't use).
 */
export default function AdminIndexPage() {
  const router = useRouter();
  const { can, canAny, loading } = usePermissions();

  useEffect(() => {
    if (loading) return;
    const flat = navigationConfig.admin.flatMap((l) => (l.children ? l.children : [l]));
    const landing =
      // a section they explicitly can use (one permission, or any of a set)
      flat.find((it) => (it.permission && can(it.permission)) || (it.anyOf && canAny(it.anyOf)))
      || flat.find((it) => !it.permission && !it.anyOf && it.path.startsWith('/admin')) // else any always-on admin page
      || { path: '/admin/dashboard' };
    router.replace(landing.path);
  }, [loading, can, canAny, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
    </div>
  );
}
