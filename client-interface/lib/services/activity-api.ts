import { apiClient } from './api-client';
import type {
  MyActivityResponse,
  MenteeActivityResponse,
  AdminActivityOverview,
  ActivityEventType,
  ActivityEventCategory,
} from '@/lib/types/activity';

export const activityApi = {
  // ─── Session lifecycle ────────────────────────────────────────────────────

  startSession: () =>
    apiClient.post<{ sessionId: string; date: string }>('/activity/session/start'),

  heartbeat: (durationMinutes: number) =>
    apiClient.post<{ activeMinutes: number }>('/activity/session/heartbeat', { durationMinutes }),

  endSession: () =>
    apiClient.post('/activity/session/end'),

  // ─── Event tracking ───────────────────────────────────────────────────────

  logEvent: (params: {
    eventType: ActivityEventType;
    eventCategory?: ActivityEventCategory;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }) => apiClient.post('/activity/event', params),

  logPageView: (page: string) =>
    apiClient.post('/activity/page-view', { page }),

  // ─── Summaries ────────────────────────────────────────────────────────────

  getMySummary: (days = 7) =>
    apiClient.get<MyActivityResponse>('/activity/me/summary', { params: { days } }),

  getMenteeSummary: (menteeId: string, days = 7) =>
    apiClient.get<MenteeActivityResponse>(`/activity/mentee/${menteeId}/summary`, {
      params: { days },
    }),

  getAdminOverview: (days = 7) =>
    apiClient.get<AdminActivityOverview>('/activity/admin/overview', { params: { days } }),
};
