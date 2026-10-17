'use client';

import { SectionCard } from '@/components/platform/primitives';
import type { WorkspaceDetail } from '@/lib/services/platform-api';

/**
 * Operator billing actions for one workspace. The editors land in the billing
 * phases; until then this panel states what will live here rather than
 * pretending the controls exist.
 */
export function PlanActions({ detail, organizationId, onChanged }: {
  detail: WorkspaceDetail; organizationId: string; onChanged: () => void;
}) {
  void detail; void organizationId; void onChanged;
  return (
    <SectionCard title="Operator actions" description="Plan assignment, request activation and custom limits.">
      <p className="text-sm text-muted-foreground">Billing controls are being rolled out to the console.</p>
    </SectionCard>
  );
}
