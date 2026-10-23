import { apiClient } from './api-client';

/**
 * Mentee progress reports: one person or a whole clan, over a period.
 *
 * The server resolves who the caller may report on from their own access, so
 * nothing here needs to pre-filter the mentee list — sending an id you cannot
 * view gets it dropped and counted, not honoured.
 */

export interface ReportStanding {
  rank: number | null;
  of: number;
  score: number | null;
  notRankedBecause: string | null;
}

export interface MenteeReport {
  generatedAt: string;
  period: { from: string; to: string };
  mentee: { id: string; name: string; email: string; avatarUrl: string | null };
  context: {
    clan: { id: string; name: string; kind: string } | null;
    program: { id: string; name: string; totalWeeks: number | null } | null;
    week: number | null;
    totalWeeks: number | null;
  };
  /** As at the END of the period, not as at today. */
  progress: {
    absolute: number;
    relative: number;
    onTimeRate: number;
    avgRating: number;
    momentum: string;
    risk: string;
    riskReason: string | null;
    signals: string[];
    openBlockers: number;
    pendingApprovals: number;
    extensions: number;
    tasksAssigned: number;
    tasksCompleted: number;
    lastActive: string;
  };
  /** Only what moved inside the window. */
  activity: {
    assigned: number;
    submitted: number;
    completed: number;
    stillOpen: number;
    pointsEarned: number;
    averageRating: number | null;
    completedTasks: { id: string; title: string; completedAt: string; rating: number | null; points: number; late: boolean }[];
    openTasks: { id: string; title: string; dueDate: string | null; status: string }[];
  };
  roadmaps: {
    id: string;
    name: string;
    steps: number;
    assigned: number;
    completed: number;
    percentOfRoadmap: number;
    percentOfAssigned: number;
  }[];
  standing: { inClan: ReportStanding | null; inProgram: ReportStanding | null };
}

export interface ReportScope {
  menteeIds?: string[];
  clanId?: string | null;
  programId?: string | null;
  from?: string;
  to?: string;
}

export const menteeReportsApi = {
  /** One mentee. Defaults to the current month when no dates are given. */
  one: (menteeId: string, params: { from?: string; to?: string; clanId?: string | null } = {}) => {
    const qs = new URLSearchParams();
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    if (params.clanId) qs.set('clanId', params.clanId);
    return apiClient
      .get<{ data: { report: MenteeReport } }>(`/mentor/mentee/${menteeId}/report?${qs.toString()}`)
      .then((r) => r.data.report);
  },

  /** Several at once. `refused` counts ids the caller may not report on. */
  batch: (scope: ReportScope) =>
    apiClient
      .post<{ data: { reports: MenteeReport[]; refused: number; capped: boolean } }>('/mentor/reports/batch', scope)
      .then((r) => r.data),

  /**
   * Mail them outward, to people who do not have accounts here — typically
   * whoever is funding the fellowship.
   */
  send: (input: ReportScope & { recipients: string[]; note?: string }) =>
    apiClient
      .post<{ data: { sent: number; recipients: number; mentees: number; refused: number; capped: boolean } }>(
        '/mentor/reports/send',
        input,
      )
      .then((r) => r.data),
};
