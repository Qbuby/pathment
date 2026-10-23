/**
 * One mentee's record across every clan in the organisation.
 *
 * Their work stays in the clan where it happened — nothing is moved or copied.
 * This is the read that follows the mentee instead, so a mentor deciding what
 * to assign next is not blind to everything before this clan.
 *
 * The visibility tiers are enforced on the server. They are modelled here as a
 * DISCRIMINATED UNION on `detail` so that reading `submissions` off a
 * title-only task is a compile error rather than something a reviewer has to
 * notice.
 */

/** What is visible about a task the viewer may only see in summary. */
export interface RecordTaskBase {
  id: string;
  title: string;
  type: string | null;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  isLate: boolean | null;
  mentorId: string | null;
  /** The viewer set this work — it stays theirs wherever the mentee moves. */
  assignedByViewer: boolean;
}

export interface RecordTaskSubmission {
  id: string;
  version: number;
  status: string;
  submittedAt: string | null;
}

export type RecordTask =
  | (RecordTaskBase & { detail: 'titleOnly' })
  | (RecordTaskBase & {
    detail: 'full';
    finalRating: number | null;
    submissions: RecordTaskSubmission[];
  });

export interface RecordClan {
  /**
   * `null` on the unattributed group — work whose `clan_id` is unset and which
   * no single clan can be proved to own. It is not a clan, so it has no id;
   * the alternative was dropping the rows, which is how this panel came to
   * report 0 of 0 tasks for a mentee with twenty-three.
   */
  clanId: string | null;
  /** Only ever true on that one group. */
  unattributed?: boolean;
  clanName: string | null;
  clanKind: 'cohort' | 'standing';
  programId: string | null;
  programName: string | null;
  /** `removed` is a clan they LEFT — the history this record exists to keep. */
  membershipStatus: 'active' | 'paused' | 'removed' | null;
  joinedAt: string | null;
  leftAt: string | null;
  current: boolean;
  /** `summary` withholds submissions; see the tiers on the server service. */
  visibility: 'full' | 'summary';
  mentoredByViewer: boolean;
  metrics: {
    tasksAssigned: number;
    tasksCompleted: number;
    tasksUnfinished: number;
    openBlockers: number;
  };
  /** Absent on a compact read. */
  tasks?: RecordTask[];
}

export interface MenteeRecord {
  menteeId: string;
  mentee: { id: string; firstName: string; lastName: string; profilePictureUrl: string | null };
  viewer: { isAdmin: boolean; mentoredClanIds: string[] };
  clans: RecordClan[];
  certificate: { tier: string; certificateNumber: string | null } | null;
  totals: {
    clans: number;
    programmes: number;
    tasksAssigned: number;
    tasksCompleted: number;
    tasksUnfinished: number;
    openBlockers: number;
  };
  sectionErrors: Record<string, string>;
}

/** Open work in the mentee's OTHER clans — what clan review needs. */
export interface OpenWorkElsewhere {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  clanId: string;
  clanName: string | null;
  assignedByViewer: boolean;
}
