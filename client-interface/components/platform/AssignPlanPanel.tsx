'use client';

import { SectionCard } from '@/components/platform/primitives';
import type { WorkspaceDetail } from '@/lib/services/platform-api';

/** Operator plan assignment - lands with the billing phase. */
export function AssignPlanPanel({ detail, organizationId, onChanged }: {
  detail: WorkspaceDetail; organizationId: string; onChanged: () => void;
}) {
  void detail; void organizationId; void onChanged;
  return (
    <SectionCard title="Plan assignment" description="Move this workspace to another plan.">
      <p className="text-sm text-muted-foreground">Plan controls are being rolled out to the console.</p>
    </SectionCard>
  );
}
