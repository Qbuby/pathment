/**
 * The permission vocabulary - the single source of truth for every action that
 * can be authorized. Keep keys stable (they're persisted in role bundles and
 * checked in code). Grouped by domain for readability only.
 *
 * A permission answers "WHAT can you do"; the scope it's checked at (org /
 * program / clan / self) answers "ON WHAT" - see authzService.
 */
const PERMISSIONS = {
  // Programs & curriculum
  PROGRAM_CREATE: 'program.create',
  PROGRAM_MANAGE: 'program.manage',
  PROGRAM_PUBLISH: 'program.publish',
  COHORT_MANAGE: 'cohort.manage',
  ROADMAP_AUTHOR: 'roadmap.author',          // org/template roadmaps
  ROADMAP_PUBLISH_LOCAL: 'roadmap.publish_local', // a mentor's own roadmap

  // Intake / admissions
  INTAKE_MANAGE: 'intake.manage',            // cohorts, applications, review/accept
  ASSESSMENT_AUTHOR: 'assessment.author',
  INVITE_CREATE: 'invite.create',

  // Clans & people
  CLAN_CREATE: 'clan.create',
  CLAN_MANAGE_MEMBERS: 'clan.manage_members',
  // Clan photo upload/change. Lead mentors always may; co-mentors get it by
  // default and a lead can revoke it per person (same denied-list pattern).
  CLAN_AVATAR: 'clan.avatar',
  MENTEE_VIEW: 'mentee.view',                // see mentees' profiles/progress
  MENTEE_MANAGE: 'mentee.manage',            // notes, insights, placement actions
  MENTEE_ADD: 'mentee.add',                  // add mentees to a clan (co-mentor toggle)
  MENTEE_TRANSFER: 'mentee.transfer',        // ask another clan to take a mentee, and accept incoming moves
  USER_MANAGE: 'user.manage',               // org user directory / status

  // Work
  TASK_ASSIGN: 'task.assign',
  TASK_REVIEW: 'task.review',

  // System Pool — pre-clan selection. Each is checked at the pool's PROGRAMME
  // scope, so a pool reviewer for one programme cannot touch another's pool.
  // Deliberately five narrow permissions rather than one "manager" role.
  POOL_MANAGE: 'pool.manage',     // create, configure, open, close a pool
  POOL_MEMBERS: 'pool.members',   // import, invite, withdraw, disqualify candidates
  POOL_ASSIGN: 'pool.assign',     // give qualifying work to pool members
  POOL_REVIEW: 'pool.review',     // review pool submissions, enter scores
  POOL_SELECT: 'pool.select',     // confirm selection, start clan placement

  // Day planning
  /**
   * Organise YOUR OWN day: put work into a time block, move it between blocks,
   * tick it off, keep blocks of your own.
   *
   * A mentee holds this at `self` scope, which is the point of it. Until now
   * every schedule route was gated on `authorize(['mentor','admin'])` — the
   * legacy role array — so a mentee had exactly one endpoint and could only
   * read. Widening that array would have handed mentees a mentor's powers; a
   * permission is what lets them arrange their own time and nothing else.
   */
  SCHEDULE_PLAN: 'schedule.plan',
  /**
   * Shape somebody ELSE's day: assign a template, lock a block so it cannot be
   * moved, push one block to a whole roster.
   */
  SCHEDULE_ASSIGN: 'schedule.assign',

  // Certificates
  // Signing off on the grade a mentee's certificate will be issued at. Held by
  // lead mentors and, by default, co-mentors — a lead can revoke it per person
  // the same way they revoke any other co-mentor permission.
  CERTIFICATE_VERIFY: 'certificate.verify',

  // Shared resource library (org-global documents/links)
  LIBRARY_MANAGE: 'library.manage',

  // Community
  COMMUNITY_POST: 'community.post',
  COMMUNITY_MODERATE: 'community.moderate',
  ANNOUNCEMENT_POST: 'announcement.post',    // broadcast to a clan/program (mentor+)

  // Gamification (badges, challenges, gift catalog)
  GAMIFICATION_MANAGE: 'gamification.manage',

  // Platform
  ANALYTICS_VIEW: 'analytics.view',
  ACCESS_MANAGE: 'access.manage',            // grant/revoke roles (IAM itself)
  SYSTEM_SETTINGS: 'system.settings',
  FEEDBACK_MANAGE: 'feedback.manage'         // triage user-submitted feedback / bug reports
};

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

const P = PERMISSIONS;

/**
 * The same vocabulary, grouped and in words, for anything that has to show it
 * to a person choosing what a role may do.
 *
 * It lives here because it was living in the admin web page instead, hardcoded,
 * and had already fallen behind: `mentee.transfer` and `feedback.manage` were
 * missing from it, so neither could be granted to a custom role through the
 * only screen that grants them. A list of permissions kept next to a screen
 * drifts from the list of permissions kept next to the code. This one cannot,
 * and a test asserts every permission appears exactly once.
 *
 * The labels are what somebody choosing sees, so they are written as the thing
 * being allowed rather than as the key with the dots taken out.
 */
const PERMISSION_GROUPS = [
  {
    label: 'Programmes and curriculum',
    permissions: [
      { key: P.PROGRAM_CREATE, label: 'Create programmes' },
      { key: P.PROGRAM_MANAGE, label: 'Edit programmes' },
      { key: P.PROGRAM_PUBLISH, label: 'Publish a programme' },
      { key: P.COHORT_MANAGE, label: 'Run cohorts' },
      { key: P.ROADMAP_AUTHOR, label: 'Write org roadmaps' },
      { key: P.ROADMAP_PUBLISH_LOCAL, label: 'Publish their own roadmap' },
      { key: P.ASSESSMENT_AUTHOR, label: 'Write quizzes and interviews' }
    ]
  },
  {
    label: 'Getting people in',
    permissions: [
      { key: P.INTAKE_MANAGE, label: 'Run intake and applications' },
      { key: P.INVITE_CREATE, label: 'Send invites' }
    ]
  },
  {
    label: 'Selection pools',
    permissions: [
      { key: P.POOL_MANAGE, label: 'Set up and run selection pools' },
      { key: P.POOL_MEMBERS, label: 'Add and remove pool candidates' },
      { key: P.POOL_ASSIGN, label: 'Give pool candidates work' },
      { key: P.POOL_REVIEW, label: 'Review pool candidates\' work' },
      { key: P.POOL_SELECT, label: 'Select candidates and place them in clans' }
    ]
  },
  {
    label: 'People and clans',
    permissions: [
      { key: P.CLAN_CREATE, label: 'Create clans' },
      { key: P.CLAN_MANAGE_MEMBERS, label: 'Change who is in a clan' },
      { key: P.CLAN_AVATAR, label: 'Change the clan photo' },
      { key: P.MENTEE_VIEW, label: 'See mentee records' },
      { key: P.MENTEE_MANAGE, label: 'Edit mentee records' },
      { key: P.MENTEE_ADD, label: 'Add a mentee' },
      { key: P.MENTEE_TRANSFER, label: 'Move a mentee between clans' },
      { key: P.USER_MANAGE, label: 'Manage any account' }
    ]
  },
  {
    label: 'The work itself',
    permissions: [
      { key: P.TASK_ASSIGN, label: 'Set work' },
      { key: P.SCHEDULE_PLAN, label: 'Plan your own day' },
      { key: P.SCHEDULE_ASSIGN, label: 'Assign and lock schedules' },
      { key: P.TASK_REVIEW, label: 'Mark work' },
      { key: P.CERTIFICATE_VERIFY, label: 'Sign off certificate grades' },
      { key: P.LIBRARY_MANAGE, label: 'Manage the library' }
    ]
  },
  {
    label: 'Community and rewards',
    permissions: [
      { key: P.COMMUNITY_POST, label: 'Post to the community' },
      { key: P.COMMUNITY_MODERATE, label: 'Moderate the community' },
      { key: P.ANNOUNCEMENT_POST, label: 'Make announcements' },
      { key: P.GAMIFICATION_MANAGE, label: 'Manage points and rewards' }
    ]
  },
  {
    label: 'Running Pathment',
    permissions: [
      { key: P.ANALYTICS_VIEW, label: 'See the numbers' },
      { key: P.ACCESS_MANAGE, label: 'Give and take roles' },
      { key: P.SYSTEM_SETTINGS, label: 'Change system settings' },
      { key: P.FEEDBACK_MANAGE, label: 'Triage reported problems' }
    ]
  }
];

module.exports = { PERMISSIONS, ALL_PERMISSIONS, PERMISSION_GROUPS };
