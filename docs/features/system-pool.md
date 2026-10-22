# System Pool (pre-clan selection)

**What it is:** a real pre-clan state for people who are on the platform but not yet in a
clan. Operators put candidates in a pool, give them existing Pathment work (tasks, quizzes,
interviews), review it, score it, shortlist, decide, and only then place the chosen ones
into clans with their mentor team.

**Why it exists:** task assignment assumed every person is a mentee in a clan. Selection
rounds (e.g. 300 candidates → 50 places) happen *before* that. Fake "holding" clans would
corrupt enrollment, progress, analytics and permissions, so the pool is its own state.

## Data model
Migration `140_candidate_pools`: two tables and one column, all additive.
- `CandidatePool` — programme-bound round: status `draft → open → qualifying → reviewing → placing → closed`
  (+ `archivedAt`), `selectionQuota`, `capacity`, dates, versioned `scoringPolicy`
  (components with label, weight, source, required — weights total 100), `reminderPolicy`, `settings`
  (`autoAssignOnActivation`, `waitlistSize`, `targetClanIds`), and
  `workItems` — the pool's work, one entry per piece (`kind`, its own task template `roadmapTaskId`,
  `componentKey`, `required`, `dueAt`, kit `config`). Edited under a row lock.
- `PoolMember` — one per (pool, email). `userId` is NULL while only invited. Separate tracks:
  `status` (invited/active/qualifying/reviewing/completed), `decision`
  (selected/waitlisted/not_selected/withdrawn/disqualified), and `placedAt` (set only once enrollment and
  clan membership exist). JSON fields: `details` (names, source, activatedAt), `manualScores`,
  `placement` (pending/failed, target clan, error, attempts), `reminders` (each reminder sent).
- `AssignedTask.poolMemberId` — NULL for ordinary work. Partial unique index on
  `(pool_member_id, roadmap_task_id)`: the same work reaches the same member once.
- Shortlists live in `audit_logs`: `POOL_SHORTLIST_GENERATED` (version, fingerprint, policy, quota,
  blockers, full ranking) and `POOL_SELECTION_CONFIRMED` (final outcomes, override reasons). The confirmed
  result is also written onto each `PoolMember` (decision, `scoreComponents`, `totalScore`, `rank`).

## The fence (most important rule)
Pool work must never appear in a clan — before placement, and above all after it.
- `AssignedTask` has a **default scope** `poolMemberId IS NULL`. Every existing query (lists, counts,
  bulk updates, includes) sees ordinary work only. Code that handles pool work opts in with
  `AssignedTask.scope('withPoolWork')` and then authorises itself (ownership, or `canActOnTask`).
- Raw SQL that reads `assigned_tasks` filters explicitly (`cohortService.taskSql`, badge counts,
  standing-clan mirror).
- `authzService.scopeOfAssignedTask` resolves pool work to the **pool's programme**, never a clan.
  `canActOnTask` requires `pool.review` for pool work — a clan mentor never qualifies, and nobody
  reviews their own work.
- The workspace boundary is a hook, not a scope: opting in never crosses workspaces.

## Backend
- **Services:** `poolService` (pools, transitions, dashboard, history), `poolMemberService`
  (import/invite/applications/withdraw/disqualify/manual scores/activation), `poolTaskService`
  (work + idempotent assignment), `poolReviewService` (queue, review via `submissionService`),
  `poolScoringService` (scores, shortlist, confirm, decisions), `poolPlacementService` (preview,
  plan, idempotent placement via `clanService.addMember`), `poolReminderService` (hourly, from
  `notificationScheduler`), `poolCandidateService` (self-only reads), `poolWorkEvents` (the shared
  engine's pool hooks).
- **Shared engine reused:** `submissionService.submitTaskWithFiles` / `reviewSubmission`, the quiz and
  interview runners. For pool work: never any points, no streaks/badges/mentor
  stats, no roadmap advance, reviewers (not a mentor) are notified, writes freeze once the pool closes
  or the candidate has a decision.
- **API `/api/pools`** — each route checks a specific permission at the pool's programme:
  `pool.manage` (create/configure/status), `pool.members` (import, invite, applications, withdraw,
  disqualify), `pool.assign` (work), `pool.review` (queue, review, manual scores), `pool.select`
  (shortlist, confirm, decisions, placement); any pool permission reads.
- **API `/api/candidate`** — self only: pools, tasks, task detail, start, submit.
- **Roles:** `pool_operator` (all five, programme scope), `pool_reviewer` (`pool.review`); `program_admin`
  holds all five. None is admin-tier: `hasPoolAccess` opens Selection pools only.

## Frontend
- **Admin → Admissions → Selection pools** (`/admin/pools`, `/admin/pools/[id]`): Overview,
  Candidates, Work, Review, Scores & shortlist, Placement, Settings, History. Shown to anyone with a
  `pool.*` permission; pool-only roles see nothing else in the admin area.
- **Intake → a cohort → select applicants → "Add to pool"**: puts the selected applicants into any open
  pool. One pool can gather applicants from several cohorts, of several programmes — but only programmes
  whose intake the person adding them runs (`intake.manage` there; the pool's own programme always counts).
  A pool has no cohort of its own: selected people are placed in the pool's programme's clans, and their
  enrollment takes the cohort they applied through when it is that programme's. Their applications are not
  changed — Accept & invite and clan placement work as before.
- **Candidate area** (`/candidate/dashboard`, `/candidate/tasks/[id]`, quiz/interview runners reused
  under `/candidate/...`, notifications). No community, directory or mentee portal until placement.

## Role flows
- **Operator:** create pool → set scoring and reminders → add candidates (CSV/emails/applications) →
  add work (linked to score components) → watch the dashboard → generate shortlist → resolve ties /
  missing reviews → confirm → plan placement → place (retry failures).
- **Reviewer:** Review tab → open a submission → rate 0–5 (the score input) + approve or request
  changes; enter hand scores for `manual` components.
- **Candidate:** invitation → register (a candidate account, no mentee profile) → My qualification →
  hand in work / take quizzes and interviews → read feedback, resubmit → see the outcome → after
  placement, the mentee portal.
- **Mentor:** hears only when a selected candidate is placed in their clan.

## Rules & edge cases
- Pool membership never creates an enrollment or clan membership; placement does, through the
  normal path, and is what creates the mentee profile.
- Activation links pool memberships **by email**: registering through *any* invitation to that
  address activates them (one active invitation per email is a database rule).
- Score = Σ component score × weight. Reviewed work: latest approved rating × 20. Unreviewed
  submissions block confirmation; missing work scores 0 (warned).
- A tie at the cutoff blocks confirmation until every tied candidate is decided with a reason; every
  change to a proposed outcome needs a reason; all decisions are audited against the pool.
- Placement locks the clan row and checks capacity (`maxMentees`) and an active lead mentor; a
  failure marks only that person `failed`. Retrying never duplicates enrollments or memberships.
- Reminders stop at send time when work is handed in, the candidate exits or is decided, or the
  pool closes. Invitation reminders reissue the link (only its hash is stored).

## Related
[Intake & Assessments](./intake-and-assessments.md) · [Roadmaps & Tasks](./roadmaps-and-tasks.md) ·
[Authorization](./authorization-rbac.md) · [Programs, Cohorts & Clans](./programs-cohorts-clans.md) ·
[Notifications](./notifications-and-email.md)
