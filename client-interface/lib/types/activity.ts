// ─── Event types ─────────────────────────────────────────────────────────────

export type ActivityEventType =
  | 'page_view'
  | 'task_opened'
  | 'task_started'
  | 'submission_started'
  | 'submission_completed'
  | 'extension_requested'
  | 'blocker_logged'
  | 'message_sent'
  | 'program_viewed'
  | 'milestone_reached';

export type ActivityEventCategory =
  | 'navigation'
  | 'task'
  | 'submission'
  | 'messaging'
  | 'general';

// ─── Session / summary shapes ────────────────────────────────────────────────

export interface DailySession {
  date: string;            // YYYY-MM-DD
  activeMinutes: number;
  pageViews: number;
  eventsCount: number;
  sessionStart?: string;
}

export interface ActivitySummary {
  totalActiveMinutes: number;
  activeDays: number;
  avgDailyMinutes: number;
  todayActiveMinutes: number;
  currentStreak: number;
  /** Self-reported hours logged on submitted tasks in the period */
  totalWorkHours?: number;
}

export interface RecentEvent {
  eventType: ActivityEventType;
  eventData: Record<string, unknown>;
  createdAt: string;
}

export interface MyActivityResponse {
  summary: ActivitySummary;
  dailySessions: DailySession[];
  recentEvents: RecentEvent[];
}

// ─── Mentor view of a mentee ─────────────────────────────────────────────────

export interface MenteeActivityResponse {
  mentee: { id: string; firstName: string; lastName: string; email: string };
  summary: ActivitySummary;
  dailySessions: DailySession[];
  recentEvents: RecentEvent[];
}

// ─── Admin overview ───────────────────────────────────────────────────────────

export interface MenteeActivityStat {
  user: { id: string; firstName: string; lastName: string; email: string; profilePictureUrl?: string | null };
  totalActiveMinutes: number;
  activeDays: number;
  avgDailyMinutes: number;
  lastActiveDate: string | null;
  todayActiveMinutes: number;
  sessions: { date: string; activeMinutes: number }[];
}

export interface AdminActivityOverview {
  platform: {
    activeToday: number;
    activeThisWeek: number;
    avgDailyMinutesPerMentee: number;
    periodDays: number;
  };
  menteeStats: MenteeActivityStat[];
}

/** One page in the feature-usage report, as the server counted it. */
export interface PageUsage {
  page: string;
  views: number;
  people: number;
  lastUsed: string | null;
}

export interface FeatureUsageResponse {
  days: number;
  pages: PageUsage[];
  /** People of each role who opened anything in the window. */
  activeByRole: Record<string, number>;
  /** Active members of each role — the denominator. */
  eligibleByRole: Record<string, number>;
  daily: { day: string; views: number; people: number }[];
  /** The first page view ever recorded, so the report cannot overclaim. */
  trackingSince: string | null;
  /** False when the window reaches back further than the record does. */
  coversFullWindow: boolean;
}
