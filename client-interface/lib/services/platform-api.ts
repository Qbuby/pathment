import { apiClient } from './api-client';

/**
 * The platform console API - the OPERATOR surface (/api/platform/*).
 * Server-side, every route is gated on platform_admins tiers; nothing here is
 * reachable through a workspace role. The workspace header the client sends is
 * ignored for these paths.
 */

// ── Identity & governance ─────────────────────────────────────────────────────

export type PlatformRole = 'owner' | 'billing' | 'support' | 'readonly';
export type PlatformGate = 'read' | 'support' | 'billing' | 'lifecycle' | 'owner';

export interface PlatformMe {
  isPlatformAdmin: boolean;
  role: PlatformRole | null;
  via: 'grant' | 'env' | null;
  gates: PlatformGate[];
  user: { id: string; firstName: string; lastName: string; email: string };
}

export interface PlatformAdminRow {
  id: string;
  userId: string;
  role: PlatformRole;
  revokedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string } | null;
}

export interface PlatformAuditEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetOrganizationId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  reason: string | null;
  actorEmail: string | null;
  createdAt: string;
  actor: { id: string; firstName: string; lastName: string; email: string } | null;
  targetOrganization: { id: string; name: string; slug: string } | null;
}

export interface Paged { total: number; page: number; pages: number }

// ── Workspaces ────────────────────────────────────────────────────────────────

export type WorkspaceStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'archived';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'cancelled';

export interface DirectoryRow {
  id: string;
  name: string;
  slug: string;
  status: WorkspaceStatus;
  logoUrl: string | null;
  primaryColor: string;
  timezone: string;
  createdAt: string;
  onboardingSource: string;
  isDemo: boolean;
  plan: { key: string; name: string } | null;
  requestedPlan: { key: string; name: string; requestedAt: string | null } | null;
  subscriptionStatus: SubscriptionStatus | null;
  billingInterval: 'monthly' | 'annual' | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  overriddenKeys: string[];
  usage: { members: number; programs: number; clans: number };
  limits: { members: number | null; programs: number | null; clans: number | null };
  owner: { id: string; firstName: string; lastName: string; email: string; membershipStatus: string } | null;
  lastActivityAt: string | null;
}

export interface PlatformPlan {
  id: string;
  key: string;
  name: string;
  description: string | null;
  monthlyPriceCents: number;
  annualPriceCents: number;
  currency: string;
  limits: Record<string, number>;
  features: Record<string, boolean>;
  active: boolean;
  sortOrder: number;
}

export interface WorkspaceSubscription {
  id: string;
  status: SubscriptionStatus;
  billingInterval: 'monthly' | 'annual';
  provider: string | null;
  requestedPlanId: string | null;
  requestedAt: string | null;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  overrides: { limits?: Record<string, number>; features?: Record<string, boolean>; meta?: Record<string, unknown> };
  plan: PlatformPlan & { publishedLimits?: Record<string, number>; publishedFeatures?: Record<string, boolean> };
  requestedPlan?: PlatformPlan | null;
  overriddenLimits?: string[];
}

export interface WorkspaceDetail {
  organization: {
    id: string; name: string; slug: string; status: WorkspaceStatus;
    logoUrl: string | null; primaryColor: string; timezone: string;
    createdAt: string; updatedAt: string; deletedAt: string | null;
    onboardingSource: string; isDemo: boolean;
    settings: Record<string, unknown>;
    creator: { id: string; firstName: string; lastName: string; email: string } | null;
  };
  subscription: WorkspaceSubscription | null;
  usage: { members: number; programs: number; clans: number };
  memberBreakdown: { active: number; invited: number; suspended: number; left: number };
  counts: { programsByStatus: Record<string, number>; enrollments: number | null };
  domains: Array<{ id: string; hostname: string; status: string; isPrimary: boolean; verifiedAt: string | null }>;
  apps: Array<{ id: string; status: string; credentialsMasked: string | null; lastVerifiedAt: string | null; app: { id: string; name: string; type: string; integrationKey: string | null } }>;
  aiConnections: Array<{ id: string; provider: string; label: string; model: string | null; status: string; keyMasked: string | null; ownerId: string | null; createdAt: string }>;
  ownerInvite: { id: string; status: 'pending' | 'used' | 'revoked' | 'expired'; expiresAt: string; usedAt: string | null; createdAt: string } | null;
  lastActivityAt: string | null;
}

export interface WorkspaceMemberRow {
  membershipId: string;
  role: 'owner' | 'admin' | 'member' | 'guest';
  status: 'invited' | 'active' | 'suspended' | 'left';
  joinedAt: string | null;
  user: { id: string; firstName: string; lastName: string; email: string; role: string; status: string; lastLoginAt: string | null; createdAt: string };
}

export interface PlatformMetrics {
  organizations: { total: number; byStatus: Record<string, number>; newLast30Days: number };
  users: { total: number; activeMemberships: number; newLast30Days: number };
  billing: {
    planDistribution: Array<{ key: string; name: string; count: number }>;
    pendingPlanRequests: number;
    trialsExpiringIn14Days: number;
    mrrCents: number;
  };
  leads: { new: number };
}


export interface ProvisionInput {
  name: string;
  slug: string;
  timezone: string;
  planKey: string;
  billingInterval: 'monthly' | 'annual';
  trialDays: number;
  owner: { email: string; firstName: string; lastName: string };
  leadId?: string | null;
  reason?: string;
}

export interface ProvisionResult {
  organization: { id: string; name: string; slug: string; status: WorkspaceStatus };
  owner: { id: string; email: string; account: 'existing' | 'created' };
  activation: 'email_sent' | 'not_needed';
}

export interface ActivationInfo {
  organization: { name: string; slug: string };
  owner: { email: string; firstName: string };
  expiresAt: string;
}


export interface OverrideReportRow {
  organization: { id: string; name: string; slug: string; status: WorkspaceStatus };
  plan: { key: string; name: string } | null;
  limits: Array<{ key: string; value: number; planValue: number | null }>;
  features: Array<{ key: string; value: boolean; planValue: boolean | null }>;
  meta: { reason?: string | null; updatedBy?: string; updatedAt?: string } | null;
}

const data = <T,>(response: { data: T }) => response.data;

export const platformApi = {
  me: () => apiClient.get<{ data: PlatformMe }>('/platform/me').then(data),

  admins: {
    list: (includeRevoked = false) =>
      apiClient.get<{ data: { admins: PlatformAdminRow[] } }>('/platform/admins', { params: { includeRevoked } }).then((r) => r.data.admins),
    grant: (input: { email: string; role: PlatformRole }) =>
      apiClient.post<{ data: { admin: PlatformAdminRow } }>('/platform/admins', input).then((r) => r.data.admin),
    update: (id: string, input: { role: PlatformRole }) =>
      apiClient.patch<{ data: { admin: PlatformAdminRow } }>(`/platform/admins/${id}`, input).then((r) => r.data.admin),
    revoke: (id: string) => apiClient.delete(`/platform/admins/${id}`),
  },

  audit: {
    list: (params: { q?: string; action?: string; organizationId?: string; page?: number; limit?: number }) =>
      apiClient.get<{ data: Paged & { entries: PlatformAuditEntry[] } }>('/platform/audit', { params }).then(data),
    actions: () => apiClient.get<{ data: { actions: string[] } }>('/platform/audit/actions').then((r) => r.data.actions),
  },

  metrics: () => apiClient.get<{ data: PlatformMetrics }>('/platform/metrics').then(data),

  organizations: {
    list: (params: {
      search?: string; status?: string; planKey?: string; hasOverrides?: boolean;
      sort?: 'created' | 'name' | 'members' | 'activity'; page?: number; limit?: number;
    }) => apiClient.get<{ data: Paged & { organizations: DirectoryRow[] } }>('/platform/organizations', { params }).then(data),
    detail: (id: string) => apiClient.get<{ data: WorkspaceDetail }>(`/platform/organizations/${id}`).then(data),
    members: (id: string, params: { search?: string; page?: number; limit?: number }) =>
      apiClient.get<{ data: Paged & { members: WorkspaceMemberRow[] } }>(`/platform/organizations/${id}/members`, { params }).then(data),
    audit: (id: string, params: { page?: number; limit?: number }) =>
      apiClient.get<{ data: { entries: Array<{ id: string; action: string; entityType: string; createdAt: string; user: { firstName: string; lastName: string; email: string } | null }> } & Paged }>(`/platform/organizations/${id}/audit`, { params }).then(data),
    setStatus: (id: string, input: { status: WorkspaceStatus; reason: string }) =>
      apiClient.post<{ data: { id: string; slug: string; status: WorkspaceStatus } }>(`/platform/organizations/${id}/status`, input).then(data),
  },
  plans: {
    list: () => apiClient.get<{ data: { plans: PlatformPlan[] } }>('/platform/plans').then((r) => r.data.plans),
  },

  provisioning: {
    checkSlug: (slug: string) =>
      apiClient.get<{ data: { slug: string | null; available: boolean; reason: string | null } }>('/platform/slug-check', { params: { slug } }).then(data),
    provision: (input: ProvisionInput) =>
      apiClient.post<{ data: ProvisionResult }>('/platform/organizations', input).then(data),
    resendActivation: (organizationId: string) =>
      apiClient.post<{ data: { resent: boolean; owner: string } }>(`/platform/organizations/${organizationId}/activation/resend`).then(data),
    revokeActivation: (organizationId: string) =>
      apiClient.post<{ data: { revoked: boolean } }>(`/platform/organizations/${organizationId}/activation/revoke`).then(data),
  },

  activation: {
    validate: (token: string) =>
      apiClient.post<{ data: ActivationInfo }>('/platform/activation/validate', { token }).then(data),
    consume: (input: { token: string; password: string }) =>
      apiClient.post<{ data: { workspace: { name: string; slug: string }; email: string } }>('/platform/activation/consume', input).then(data),
  },
  billing: {
    subscription: (organizationId: string) =>
      apiClient.get<{ data: { subscription: WorkspaceSubscription } }>(`/platform/organizations/${organizationId}/subscription`).then((r) => r.data.subscription),
    setOverrides: (organizationId: string, input: {
      limits: Record<string, number | null>; features: Record<string, boolean | null>; reason: string;
    }) => apiClient.put<{ data: { subscription: WorkspaceSubscription } }>(`/platform/organizations/${organizationId}/overrides`, input).then((r) => r.data.subscription),
    overridesReport: () =>
      apiClient.get<{ data: { workspaces: OverrideReportRow[] } }>('/platform/overrides').then((r) => r.data.workspaces),
  },
};
