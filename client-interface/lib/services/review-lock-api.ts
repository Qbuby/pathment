import { apiClient } from './api-client';

// ── Shared shapes ─────────────────────────────────────────────────────────────
export interface ReviewLockMentor {
  id: string;
  name: string;
  clanName: string | null;
}

export interface ReviewLockRequest {
  id: string;
  mentor: ReviewLockMentor;
  sessionId: string | null;
  sessionDate: string | null;
  reason: string;
  status: 'pending' | 'approved' | 'declined';
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  decisionNote: string | null;
}

/** Where a lock or a grant applies. `organization` is the whole workspace. */
export type ReviewLockScopeType = 'organization' | 'program' | 'clan';

export interface ReviewLockGrant {
  id: string;
  mentor: ReviewLockMentor;
  reason: string | null;
  scopeType: ReviewLockScopeType;
  scopeId: string | null;
  scopeName: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  active: boolean;
}

/** One programme or clan where deletion is locked. */
export interface ReviewLockScope {
  id: string;
  scopeType: 'program' | 'clan';
  scopeId: string;
  name: string;
  lockedBy: string | null;
  createdAt: string;
}

export interface ReviewLockLog {
  action: string;
  userName: string | null;
  detail: string | null;
  createdAt: string;
}

// ── Admin responses ───────────────────────────────────────────────────────────
export interface ReviewLockState {
  /** The organisation-wide lock. Scopes below add to it; they never undo it. */
  locked: boolean;
  pendingRequests: number;
  activeGrants: number;
  /** Programmes and clans locked on their own. */
  scopes: ReviewLockScope[];
  /** Everything that could be locked, for the picker. */
  choices: {
    programs: Array<{ id: string; name: string }>;
    clans: Array<{ id: string; name: string; kind: string; programId: string; programName: string }>;
  };
}

export interface RespondResult {
  request: ReviewLockRequest;
  grant: ReviewLockGrant | null;
}

// ── Mentor responses ──────────────────────────────────────────────────────────
export interface MentorLockState {
  locked: boolean;
  /** Why it is locked, when it is: the org, their programme, or their clan. */
  lockedBy?: 'organization' | 'program' | 'clan' | null;
  hasActiveGrant: boolean;
  grantExpiresAt: string | null;
  pendingRequest: { id: string; createdAt: string } | null;
}

/**
 * Cohort-review deletion lock. Admins lock review-record deletion org-wide for
 * audit integrity; mentors request time-boxed access and admins grant it. The
 * server wraps every payload in the standard `successResponse` envelope
 * (`{ success, message, data }`), and `apiClient` returns the raw body — so each
 * method unwraps `.data` to return the bare contract shape to callers.
 */
export const reviewLockApi = {
  // Admin
  state: () => apiClient.get<{ data: ReviewLockState }>('/admin/review-lock').then((r) => r.data),
  /** No scope locks the organisation; a scope locks that one programme or clan. */
  setLocked: (locked: boolean, scope?: { scopeType: 'program' | 'clan'; scopeId: string }) =>
    apiClient.patch<{ data: { locked: boolean } }>('/admin/review-lock', { locked, ...(scope || {}) }).then((r) => r.data),
  requests: (status: 'pending' | 'all' = 'pending') =>
    apiClient.get<{ data: { requests: ReviewLockRequest[] } }>('/admin/review-lock/requests', { params: { status } }).then((r) => r.data),
  /**
   * `scopeType` narrows what the grant covers. Omitted, the server scopes it
   * to the clan of the session the mentor asked about, falling back to the
   * whole organisation — so answering "yes, fix that one record" does not
   * also hand over every other clan they run.
   */
  respond: (id: string, body: {
    approve: boolean; durationHours?: number; expiresAt?: string; note?: string;
    scopeType?: ReviewLockScopeType; scopeId?: string | null;
  }) =>
    apiClient.post<{ data: RespondResult }>(`/admin/review-lock/requests/${id}/respond`, body).then((r) => r.data),
  grants: (active = true) =>
    apiClient.get<{ data: { grants: ReviewLockGrant[] } }>('/admin/review-lock/grants', { params: { active } }).then((r) => r.data),
  revokeGrant: (id: string) =>
    apiClient.delete<{ data: { revoked: true } }>(`/admin/review-lock/grants/${id}`).then((r) => r.data),
  logs: (page = 1, limit = 10) =>
    apiClient.get<{ data: { logs: ReviewLockLog[]; total: number; page: number; limit: number } }>('/admin/review-lock/logs', { params: { page, limit } }).then((r) => r.data),

  // Mentor
  mentorLockState: () => apiClient.get<{ data: MentorLockState }>('/mentor/review/lock-state').then((r) => r.data),
  requestUnlock: (body: { sessionId?: string; reason: string }) =>
    apiClient.post<{ data: { request: ReviewLockRequest } }>('/mentor/review/unlock-request', body).then((r) => r.data),
};
