# Task run report — ClickUp "Testing and Report issues here"

Source task: https://app.clickup.com/t/37367037/z8w5vqrrpg (list `pathment`, status `planning`, priority urgent)

| | |
| --- | --- |
| Working branch | `fix/pathment-clickup-33-issues` |
| Base | `origin/staging` @ `17465bfa` |
| Git identity | Sheryar Ahmed &lt;royalsheryar505@gmail.com&gt; (repo-local) |
| Local DB | `postgres://…@localhost:5432/pathment_dev` (23 MB, 31 users, 1 org, 1 program, 2 clans) |
| Migrations | 135 applied (13 were pending at start; all applied locally) |
| Seeded logins | `admin@demo.pathment.com`, `mentor.aisha@…`, `mentor.omar@…`, `mentor.sam@…`, `mentee.*@demo.pathment.com` — all password `Demo@1234` |
| Push / deploy | **Not performed, by instruction.** |

## Specification notes (read before trusting the numbering)

1. **The task contains 33 numbered points, not 32.** The brief asked for 32. All 33 are
   tracked below in their original order. Point 6 additionally has three sub-points (i, ii, iii).
2. It is **one parent task** with 33 numbered points in a single description — there are no
   subtasks and no comments. Progress is therefore tracked per point in this file, and
   reported back as comments on the parent.
3. All 25 referenced images were downloaded and visually inspected (not inferred from filenames).
   No attachment was inaccessible.
4. **Scope flags raised before starting** (detail in the per-issue rows):
   - #1 asks for web **and mobile**. The mobile app is a **separate git repository**
     (`../pathment-mobile`); it cannot be changed on this repo's branch. Web is in scope here.
   - #21, #23, #28, #30 are open-ended product/architecture programmes, not single defects.
   - #26 and #6(iii) describe **production-scale data** (1089 members, 46 clans, ~700 MB).
     The local database has 31 users / 2 clans / 23 MB, so those numbers cannot be reproduced
     locally; the underlying query/display logic can still be read and corrected.
   - #28 asks to delete data from a database that shows ~700 MB. That is production. No
     destructive production operation will be run.
   - #2, #9, #10, #15, #24, #31 are subjective redesign requests with no acceptance criteria.

## Issue inventory and status

Legend: ⬜ not started · 🟦 in progress · ✅ done & verified · ⚠️ partial · ⛔ blocked

| # | Requirement (condensed from the task) | Status | Commit | Notes |
| --- | --- | --- | --- | --- |
| 1 | Remember the selected clan (mentor **and** mentee) across navigation/return. Web + mobile. | ⚠️ | `4d990259` | Web done & browser-verified. Mobile is a separate repo — see flag 4. |
| 2 | Announcements UI/UX is poor for admin, mentor and mentee — redesign. | ✅ | `ad3b73f3` | Feed, composer and dashboard card rebuilt; browser-verified. |
| 3 | A mentor who also has admin access sees **every clan's** announcements even on the mentor/mentee tab — scope bug. | ✅ | `93b68a66` | Verified against the running API with a mentor+admin account. |
| 4 | Loader/spinner differs between screens — use one loader everywhere. | ✅ | `18f98c6b` | 5 competing spinners unified; guard test added. |
| 5 | Mentee moved to a standing clan still sees previous clans' tasks there; mentor-deleted tasks persist; "My learning" disagrees with "This Week". | ✅ | `e5d3a6cd` | Both faults fixed; 5 tests proven to fail on the old code. |
| 6 | Community must stay open after program completion (currently read-only). | ✅ | `75883cfe` | |
| 6i | Spaces listing: separate completed vs active programs, designed properly. | ✅ | `75883cfe` | |
| 6ii | Mentors appear to auto-post (repetitive "Weekly standup") — remove that. | ✅ | `75883cfe` | |
| 6iii | Paginate members (shows ~1088) and posts (pagination/filters/search or infinite scroll). | ✅ | `75883cfe` | |
| 7 | Proper country/province/city pickers wherever location is captured, with timezone suggested from the country. | ✅ | `d0a13e8e` | **Needs migration 131 on prod.** API + browser verified. |
| 8 | Mentee "My progress" page is weak — improve or remove. | ✅ | `998861d3` | Empty-state pass, not a redesign. |
| 9 | Library (admin → mentor → mentee) redesign. | ⬜ | | |
| 10 | Mentee dashboard: re-prioritise top vs bottom; the daily/planner block does not belong there. | ⬜ | | |
| 11 | Notification / "What's new" drawers do not open smoothly (the Feedback drawer does). | ✅ | | Notifications had no animation at all; both now use the shared Drawer. |
| 12 | Paginate (or infinite-scroll) Points & badges — performance leaderboard and earned badges. | ✅ | | Also: a mentee outside the top 10 could not see themselves. |
| 13 | Surface paused mentees in clan review on the selected mentee's profile card. | ✅ | | Also fixed a 403 on every review load. |
| 14 | Review-access lock should be settable per program or per clan, not org-wide only; remove the yellow styling. | ✅ | | Same change as #27. |
| 15 | Improve the "Something went wrong" screen. | ⬜ | | The screenshot also evidences a real crash on Recognition → Top performers with "All clans". |
| 16 | Top-performers/nominations not scoped to the active (standing) clan — mentor sees other clans' nominations. | ✅ | | Also closed a cross-clan ranking leak. |
| 17 | Mentor Insights → Reports disagrees with leaderboard/progress score (both correct). Align the criteria. Also: no mentee profile pictures in progress. | ✅ | | Reports read 61 where the score read 79. |
| 18 | Mentor dashboard: remove yellow, re-prioritise, show announcements compactly. | ⬜ | | |
| 19 | Task assign: drop "Assign now / Schedule once / Repeat weekly"; use two icon menus (due date, repeat) like Microsoft To Do. No reminder icon. | ✅ | | Assign drawer only; see the scope note. |
| 20 | Mentor calendar: pick a **time** on the calendar, and set repeating availability by day + time. | ⬜ | | |
| 21 | Feature-usage statistics per role (which pages/features are actually used). | ⬜ | | Open-ended programme. |
| 22 | Admins can create standing clans too. | ✅ | | |
| 23 | Program/clan filters across the admin panel (people → mentees/mentors, enrollments, clan requests), ideally one global program selector. | ⬜ | | Open-ended programme. |
| 24 | Admin live-meeting screen redesign (calendar, Meet-like). | ⬜ | | |
| 25 | Opening a conversation must land scrolled to the newest message. | ✅ | | Also fixed a page-level crash on Messages. |
| 26 | Workspace plan & usage shows wrong usage and wrong current plan. | ⚠️ | | Contradiction + NaN + retired-plan cases fixed; the raw counts could not be reproduced locally. |
| 27 | Admin Review-Lock page: remove yellow, improve accessibility, allow grant/revoke per program or clan as well as org-wide. | ✅ | | Same change as #14; migration 133 pending on production. |
| 28 | Remove unnecessary database data (~700 MB). | ⬜ | | Production data — see flag 4. |
| 29 | Admin access logs must be human-readable, with pagination and search. | ⬜ | | Currently raw `Post /api/...` rows. |
| 30 | Extract reusable components (drawers, profile pictures, …) — reduce duplication. | ⬜ | | Open-ended programme. |
| 31 | Clan review "no mentee" empty state needs to be better. | ⬜ | | |
| 32 | A standing-clan request should carry the mentor's active mentees (with their work) across automatically. | ✅ | | Verified on the demo data, then rolled back. |
| 33 | Blockers/plan shows "N tasks" that cannot be seen; wrong tasks; must be clan-scoped for mentor and mentee. Work-history drawer reports 0 tasks while the profile shows 24. | ✅ | | Migration 132 pending on production. |

## Run log

- **Setup** — fetched `origin`, branched `fix/pathment-clickup-33-issues` from `origin/staging@17465bfa`,
  set repo-local git identity, applied 13 pending local migrations, confirmed the DB URL is localhost.
  Two pre-existing stashes were left untouched; the working tree was clean at start.

### Issue 1 — remember the selected clan

**Root cause (two defects).**
1. The choice was stored under one global key (`pathment-active-clan`) shared by every
   account on the browser. The only safe thing login could then do was delete it, and
   `clearUserScopedClientState` did exactly that on every login, sign-in link and 2FA
   completion (`AuthContext.tsx:58`). Coming back always landed somewhere else.
2. Found while verifying in the browser: `resolveMentorClan` treated an empty clan list
   as proof the saved clan was gone. An empty list is also what "not asked yet" looks
   like — `useApiQuery` reports `loading: false` while a query is still *disabled*, which
   the memberships query is until `availableRoles` arrives. The resolver answered `all`
   and the persist effect wrote that to storage, erasing the selection again.

**Fix.** Keys are now per account (`pathment-active-clan:<userId>`), so the choice is
durable *and* private; the login/logout delete is gone. One shared module
(`lib/services/clan-choice.ts`) replaces the two duplicated copies of the key names in
`ClanContext` and `portal-scope`. An existing global value is adopted once by the first
account to read it, then retired. The resolver keys off whether the clan list is actually
known (`clansKnown`) rather than off `loading`.

**Files.** `lib/services/clan-choice.ts` (new), `lib/utils/clan-selection.ts`,
`lib/context/ClanContext.tsx`, `lib/context/AuthContext.tsx`, `lib/services/portal-scope.ts`,
`tests/clan-choice.test.cjs` (new), `tests/clan-selection.test.cjs`.

**Tests run.** `node --test tests/` → 99 pass / 0 fail (90 before; 9 added).
`npx tsc --noEmit` → clean. `npm run build` → compiled successfully.

**Browser verification** (headless Chrome over CDP, real login form, seeded
`mentor.aisha@demo.pathment.com`): selected *MERN Fellows* through the actual sidebar
picker, then confirmed it survived navigating away and back, a reload, signing out, and
signing in again — the picker still reads "MERN Fellows". Confirmed `X-Active-Clan` on
live requests carries the remembered clan id, and that a second account
(`mentor.omar@…`) does not inherit it. No console errors.

**Not covered.** The mentee half of the rule shares this code path and is covered by unit
tests, but was not exercised in the browser: no seeded mentee belongs to two clans, so
there is nothing to switch between. The mobile app is a separate repository and was not
touched.

**Local test data added** (dev DB only, not committed): `mentor.aisha` was given a
`co_mentor` membership of *Node Guild* so a second clan exists to switch to, and the demo
users were given profile-photo URLs so `OnboardingGuard` stops holding the dashboard back.

### Issue 3 — announcements ignored the open portal

**Root cause.** `announcementService._visibilityWhere` returned `undefined` (no WHERE
clause at all — the whole organisation) for anyone whose capabilities included `admin`,
whatever screen they were on. The portal was never part of the query, so switching to the
mentor or mentee tab changed nothing.

**Fix.** Use `authzService.actsAsAdmin`, the portal-aware form of the same question that
already exists for this class of bug (it answers false in the mentor/mentee portal). The
rest of the rule follows: clan memberships are filtered to the roles that matter for the
open portal; the `mentors`/`mentees` audience arms only apply to the matching portal; and
a clan chosen in the sidebar narrows clan-targeted announcements to that clan. The
narrowing can only subtract — a clan the caller is not in intersects their memberships to
nothing. A request with no portal header behaves exactly as before.

**Files.** `server/src/services/announcementService.js`,
`server/src/controllers/announcementController.js`,
`server/tests/unit/announcement-portal-scope.test.js` (new).

**Tests run.** `npx jest tests/unit/announcement-portal-scope.test.js` → 7 pass / 0 fail.
`npm run lint` (syntax check, the blocking CI gate) → 694 files ok.

**API-verified** against the running local server as `mentor.aisha@demo.pathment.com`,
promoted to workspace admin so she is exactly the reported persona (`capabilities:
["admin","mentor"]`), with one clan-targeted announcement seeded per clan:

| portal | what came back |
| --- | --- |
| admin | both clan notes + org-wide + program (oversight, unchanged) |
| mentor | both clans she mentors |
| mentor + MERN selected | MERN note only — **Node Guild note gone** |
| mentee | org-wide only, neither clan note |

### Issue 2 — announcement UI

**What was wrong.** A two-column grid with every body rendered in full, so one long post
set the row height and a one-line notice got an equally large box; pinned items sorted
first but looked identical; pasted links were unclickable text; "79d ago" was the only
date; manage icons sat permanently beside every title; admin and mentor each had their own
composer built from a raw `<details>` and native `<select>`s (both against this repo's own
Drawer / SelectMenu standards), and their own ad-hoc filter bar.

**What it is now.** One readable column; pinned as its own section; avatar + tinted
audience chip + a real date past the first week (exact timestamp on hover); bodies clamped
with Read more; URLs rendered as links by splitting the text into parts (no
`dangerouslySetInnerHTML`, so text can never become markup); manage actions in a menu with
the shared confirm dialog for delete; search and audience filter built into the feed so
every portal gets the same ones. One shared `AnnouncementComposer` drawer replaces both
copies and offers only the audiences the server accepts from that role. The dashboard card
is now one line per announcement rather than a grid of tiles — which is also what issue 18
asks for on the mentor dashboard.

**Files.** `components/shared/AnnouncementFeed.tsx`, `components/shared/AnnouncementsCard.tsx`,
`components/shared/AnnouncementComposer.tsx` (new), `lib/utils/linkify.ts` (new),
`lib/hooks/shared/useAnnouncements.ts`, the three `app/{admin,mentor,mentee}/announcements`
pages, `tests/linkify.test.cjs` (new).

**Tests run.** `node --test tests/` → 106 pass / 0 fail. `tsc --noEmit` clean.
`npm run build` compiled successfully.

**Browser-verified** (admin account, seeded long announcement containing both a
`https://chat.whatsapp.com/…` and a bare `www.` link): pinned / everything-else sections
render, the long body clamps and its tail — links included — stays hidden until Read more,
both link forms resolve (`www.` gets an https scheme) and display shortened, avatars show,
search and filter chips render, the composer opens as a drawer with **zero** native
`<select>` elements. No console errors.

### Issue 4 — one loader everywhere

**Root cause.** Five competing indicators: the `Loader2` icon in a dozen sizes and
colours, three hand-rolled CSS ring spinners with different stroke widths, and on two
screens a `Clock` or `RotateCw` spun on its axis. Only 1 file used the shared
`LoadingSpinner`; 189 spun something of their own.

**Fix.** `LoadingSpinner` is the one definition and now exports a `Spinner` primitive for
places a block wrapper does not fit. The 7 ring spinners and the icons standing in for a
loader are replaced; 61 spinners that picked their own colour now use the brand token,
including ones silently inheriting a muted grey from the row around them. A refresh arrow
that spins only while its own action runs is deliberately left alone — that is one icon in
two states, not the app-is-busy indicator.

**Files.** `components/shared/LoadingSpinner.tsx`, `components/shared/index.ts`, 49 call
sites, `tests/one-loader.test.cjs` (new).

**Tests run.** `node --test tests/` → 110 pass / 0 fail (4 new guard tests covering: no
hand-rolled rings, no other icon standing in for loading, no off-brand loader colours, one
export point). `tsc --noEmit` clean, `npm run build` compiled.

**Verification gap.** Checked by static guard + build rather than in the browser: loaders
are transient, so a screenshot catches them only by luck.

### Issue 5 — the day planner showed another clan's work

**Root cause — two faults in `scheduleBoardService.board`.**
1. `_scheduleRow` fell back to *any* row the mentee had when the requested clan had none,
   so a standing clan with no schedule rendered the previous clan's blocks.
2. The task query scoped by the schedule **row's** clan rather than the clan being asked
   about. With no row — or a legacy row carrying no clan — that is no clan filter at all,
   so every task the mentee ever had, in any clan, landed on the board. This is exactly
   the screenshot: "work to plan · 5" beside a My-learning list of 1.

**Fix.** Resolve the clan once and use it for both reads, via the `menteeClanScope` helper
the rest of the codebase already uses — which keeps the one legacy case working (rows
predating per-clan schedules carry no clan and are adopted only where they cannot belong
anywhere else: a single membership, into a cohort clan). The OR groups moved inside the
single AND so the clan filter's own OR cannot overwrite them. The controller now reads the
clan through `requestedClanId`, so the sidebar's `X-Active-Clan` reaches the planner and
not only an explicit `?clanId=`.

**Files.** `server/src/services/scheduleBoardService.js`,
`server/src/controllers/scheduleBoardController.js`,
`server/tests/tasks/board-clan-scope.test.js` (new).

**Tests run.** `tests/tasks` + `tests/unit` + `tests/access` → 82 pass / 0 fail.
**All 5 new tests were run against the previous implementation and all 5 fail**, so they
genuinely cover the defect rather than the fix.

**API-verified** against the running server: a standing clan was seeded for
`mentee.maya@demo.pathment.com`, whose 24 tasks belong to her cohort clan. The cohort board
still shows her work; the standing board shows none of it; the clan header alone is enough
to scope it; My learning and the day now report the same count for the same clan.

### Issue 6 — community after a programme ends

**Root cause.** `communitySpaceService` derived `readOnly` straight from the work
lifecycle: `clan.frozenAt` for a clan space, `cohort.status === 'completed'` for a cohort
space. `communityService` then threw `ClanFrozenError` on all ten write paths.

**Fix.** Separate the two ideas. Freezing a clan protects the *record of work* and is
untouched; it is not a reason to close the conversation. `workClosed` now reports "the
programme is over" (used for grouping and labelling) and `readOnly` is reserved for a
deliberate, admin-controlled archive that nothing sets today — one named function,
`isSpaceArchived()`, is the single place to change if that feature is ever wanted.

- **(i)** Finished programmes move below a collapsed "Finished" divider in the spaces
  list, with a line explaining that the programme is closed but the conversation is not.
- **(ii)** The repeated "Weekly standup" was not a mentor posting. `notificationScheduler.postWeeklyStandups`
  auto-created one every Monday in **every active clan**, authored *as* the lead mentor,
  with no opt-in and no way to stop it. Removed (56 lines). The `standup` post type stays
  so a mentor can still write one deliberately.
- **(iii)** `getMembers` loaded every member of the scope in one response. Now paged (24
  at a time, "Show more" with the remaining count) and searched in the database — a
  browser-side filter can only search the page already downloaded. The feed already had
  cursor pagination plus `type`, `tag` and `q` filters, so that half needed no change.

**Files.** `server/src/services/communitySpaceService.js`, `communityService.js`,
`notificationScheduler.js`, `controllers/communityController.js`;
`components/community/CommunityHub.tsx`, `lib/hooks/community/useCommunityHub.ts`,
`lib/services/community-api.ts`, `lib/query/keys.ts`.

**Tests run.** `tests/clans` + `tests/notifications` + `tests/unit` → 80 pass / 0 fail.
`tsc` clean, build compiles, server syntax 695 files ok.

**API-verified** with the cohort clan frozen *and* the cohort marked completed — the exact
state that used to lock it: the space is still listed, `readOnly` false, `workClosed` true,
and a mentee posting into it gets **201** where the old code raised `ClanFrozenError`.
Members returned 2 of 30 with a correct total and `hasMore`, and a server-side name search
matched.

**Verification gap.** The grouped spaces list and the paged member panel were type-checked
and built but not screenshotted; the API behaviour behind both is verified above.

### Issue 7 — country / region / city, and the timezone that follows

**Root cause.** `city` and `country` were free-text `<input>`s, so the same place had as
many spellings as people typing it and could never be grouped or counted. The timezone was
a separate `SelectMenu` of every IANA zone with nothing tying it to the country.

**Fix.** Country → region → city pickers backed by a real dataset, and the country's
timezone offered as soon as it is known. The suggestion is only made when it *cannot* be
wrong: one zone → filled in; several → the country says so and the choice stays open,
because a wrong timezone is worse than an empty one when deadlines are read in it.

The dataset (`country-state-city`) lives **on the server** behind `GET /api/geo`, not in
the bundle — the full set is ~150,000 cities, fine to query and terrible to ship in a
page. City search runs in the database for the same reason a browser-side filter cannot
work: it can only search the page already downloaded.

`SelectMenu` gained an `onSearch` hook for callers whose real list is bigger than the
options on hand; when set, the built-in filter steps aside rather than filtering the
server's answer a second time.

**Migration 131** adds `users.country_code` (ISO-3166 alpha-2) and `users.region`. Existing
free-text values are **not** rewritten — string-matching them would silently relocate
anyone whose spelling did not line up — so the picker resolves a saved country *name* back
to its code on first edit and rows fill in as people touch them.
**This migration has not been run on production.**

**Files.** `server/src/services/geoService.js`, `server/src/routes/geo.js`,
`scripts/migrations/131_location_region_and_country_code.js`, `models/users/User.js`,
`controllers/profileController.js`, `routes/index.js`, `package.json`;
`components/shared/LocationPicker.tsx`, `components/shared/SelectMenu.tsx`,
`components/settings/LocationDetailsFields.tsx`, `lib/services/geo-api.ts`,
`lib/query/keys.ts`, the three settings hooks and the three settings pages.

**Tests run.** 9 new unit tests (`tests/unit/geo-service.test.js`) → 9 pass / 0 fail.
`tsc` clean, build compiles, server syntax 698 files ok.

**API-verified:** 250 countries with timezones; PK suggests `Asia/Karachi`, not ambiguous;
US reports 29 zones and *is* ambiguous; PK returns 8 regions; `lah` inside Punjab finds
Lahore; a capped result reports `hasMore`; `PUT /profile` round-trips city + region with
the country code upper-cased.

**Browser-verified** on Settings → Profile: all four are pickers, city is no longer free
text, choosing Pakistan fills the timezone, choosing Punjab narrows the cities, typing
reaches the server (50 options → 1) and Lahore selects. Screenshot captured.

**Scope note.** Applied to the three Settings → Profile forms, which is where the issue
points ("mostly in profiles"). The public intake form has its own field system
(`lib/config/intakeFields.ts`) and was **not** converted — flagged as remaining work.

### Issue 8 — the mentee "My progress" page

**Root cause.** The page was not thin by design, it *collapsed*. Every section whose data
was empty returned `null` instead of rendering, so a mentee who had not started yet saw
four bare numbers, two empty boxes and a lot of white space with nothing explaining any of
it. One tile read `0/-`, which is not a value — it is a template that ran out of data.

**Fix.** A pass over the empty and low-data states. The metric tiles say what they count
("of your work delivered by its due date"); the week figure reads "Not started" with the
reason instead of `0/-`; the roadmaps section explains itself and points at My learning,
where the work actually is; and the two empty "what is slowing you down" boxes become one
line saying nothing is, plus the thing mentees most need told — that logging a roadblock
helps the fair measure rather than hurting it.

**Files.** `client-interface/app/mentee/progress/page.tsx`.

**Tests run.** `tsc` clean, build compiles, client suite 110 pass / 0 fail.

**Browser-verified** as a seeded mentee with no roadmap, no roadblocks and no delays — the
exact state in the report screenshot. Screenshot captured.

**Scope note.** This is explicitly a pass over empty states, not a ground-up redesign. The
issue offered "improve it properly or either remove it"; removing it would take the daily
log, points and certificates tabs with it.

### Issue 33 — work that belonged to no clan

**Root cause.** `assigned_tasks.clan_id` and `blockers.clan_id` are nullable, and a great
deal of work carried neither — assigned before clans were attributed, or to a mentee with
no membership at the time. Every clan-scoped read in the product filters on that column,
so all of those rows were invisible to all of them, while the mentee's own profile — which
counts by mentee, not by clan — still listed them. That is the exact disagreement in the
report: the work-history drawer said *"2 clans · 0 of 0 tasks done"* and *"No work recorded
in this clan"* twice, about a mentee whose profile tab read **Work (24)**.

Reproduced before changing anything: `mentee.mei` had **23 tasks on her profile** and a
record of `tasksAssigned: 0`. Across the whole local database, **373 of 397 assigned tasks
and 3 of 3 blockers had no clan at all.**

**Fix, in three parts.**

1. **The read stops dropping them.** `menteeRecordService` gathers work with no clan into
   one group — reported, not guessed at — so a count here can no longer disagree with the
   profile. It is listed last, is never counted as a clan in `totals.clans`, and is
   `summary` tier for anyone but an admin: no clan means no clan to mentor, so nothing
   could grant the detail tier. A task the viewer *set* is still full detail, per task.
2. **Migration 132 attributes what can be attributed, without guessing.** A row moves only
   when exactly one clan can own it: by enrolment (the task and the membership name the
   same enrolment), or by sole membership — and then only when that one clan is a
   **cohort**. A standing clan is deliberately excluded, because a mentee moved into one
   has older cohort work that does not belong to it, and attributing it there would
   recreate the leak of issue 5. This mirrors the rule `clanScopedWhere` already applies on
   read. Locally it placed all 373 tasks and all 3 blockers with **nothing left ambiguous**.
3. **The write holes are closed.** `linearRoadmapService.assignToMentee` now refuses to
   create roadmap work for a mentee with no clan, matching what `taskService.createCustomTask`
   has always done — it used to write `clan_id = null` and move on. `seed-demo.js` never set
   a clan on any task or blocker, which is why the demo organisation looked broken; it does
   now.

**Files.** `server/src/services/menteeRecordService.js`,
`server/src/services/linearRoadmapService.js`,
`server/scripts/migrations/132_attribute_orphaned_work_to_clans.js`,
`server/scripts/seed-demo.js`, `server/tests/unit/mentee-record-unattributed.test.js`,
`server/tests/admin/program-completion-standing.test.js`,
`client-interface/components/mentor/MenteeRecordPanel.tsx`,
`client-interface/lib/types/mentee-record.ts`.

**Migration 132 has not been run on production.** It is idempotent (it only touches rows
where `clan_id IS NULL`), has a `--dry-run` that executes the real statements in a
transaction it throws away, and is deliberately **not reversible** — undoing it would clear
`clan_id` on rows indistinguishable from ones legitimately set since.

**Tests run.** 9 new unit tests (`tests/unit/mentee-record-unattributed.test.js`) → 9 pass.
**8 of the 9 were confirmed failing against the pre-fix service**; the ninth is a
regression guard that passes either way.

**A stale test was found and corrected.** `tests/admin/program-completion-standing.test.js`
still asserted that posting in a finished clan's community throws `CLAN_FROZEN` — the rule
issue 6 deliberately removed. It had been failing silently (see below) and now asserts the
intended contract: the community stays open on a frozen clan while tasks, submissions,
progress logs, blockers and daily logs stay shut. 10 pass.

**The test database was two migrations behind**, which is worth recording because it was
hiding real failures: `pathment_test` had never had migration 131, so `User.create` threw
on every insert and *every test in several suites* failed at the first line of its setup
with an empty error message. 131 and 132 are now applied to it.

**Verified end to end.**
- Service level: `mentee.mei` → `tasksAssigned: 23`, `tasksCompleted: 21`, attributed to
  MERN Fellows, matching her profile's Work (23).
- HTTP: `GET /api/mentor/mentee/:id/record` returns the same numbers.
- Browser, clan review → Work history drawer: **"2 clans · 22 of 24 tasks done · 2
  unfinished"**, MERN Fellows showing `22/24` — where it previously read `0 of 0`.
- Browser, the unattributed group: two tasks were temporarily orphaned, and the drawer
  rendered *"Not tied to a clan · 2/2 done"* with the header total still reading 24. The
  rows were then restored by re-running migration 132, which also demonstrated its
  idempotence.
- The day strip is correctly clan-scoped: the standing clan reports 0 blocks and 0 loose
  items (it holds no work), the cohort reports the 2 genuinely open ones.

**Found while verifying, fixed under issue 13:** `GET /api/mentor/pause-suggestions`
returns **403** for a clan the mentor genuinely leads, whenever that clan is finished —
`_scopeClans` filters on `frozenAt: null`. Clan review requests it on every load, so the
page has been logging a forbidden error since programmes started being completed.

### Issue 13 — the paused mentee in clan review

**What the report said.** "Make sure we are suggesting the paused mentee in the clan review
on the selected mentee on their little profile card."

**What was actually wrong — two things, found by watching the network.** The pause
suggestion *was* already built into the review card. It could never appear.

1. **`GET /api/mentor/pause-suggestions` returned 403 on every clan review load** for a
   clan whose programme had finished. `_scopeClans` filtered clans on `frozenAt: null` and
   then used that one list to answer two different questions: *may this person act here*
   and *does this apply here*. A mentor who leads a finished clan does oversee it — telling
   them "You do not oversee this clan" is simply false — and after issue 6 made a finished
   clan a normal place to be working, the page logged a forbidden error every time it
   opened. Caught while verifying issue 33; it was the only failing request on the page.
2. **A paused mentee vanished from clan review entirely.** The roster comes from
   `/mentor/cohort`, which resolves mentees at `status: 'active'`. Pausing is supposed to
   take somebody out of reports and reminders — and it does, correctly — but it also took
   them off the one screen where a mentor goes through their people one at a time and
   would notice that someone had stopped turning up. They were gone, with no trace, no
   explanation for the shrunken roster, and no way back from that screen.

**Fix.**

- **Authority and applicability are now separate reads.** `_overseenClans` answers "may
  they" and includes finished clans; `_scopeClans` answers "does it apply" and is the
  running subset, which the write paths and the win-back cadence keep using. A finished
  clan therefore returns **no suggestions instead of an error**, a clan the mentor does not
  run is **still refused**, and who is paused in a finished clan is still visible —
  they are, after all, still paused.
- **Clan review asks for paused mentees, and nothing else does.**
  `GET /api/mentor/cohort?includePaused=1` adds them, tagged `paused: true`, attributed to
  their clan, and excluded from every total on both the server and the client. Opt-in
  rather than always-on so the cockpit, approvals and the leaderboard keep counting exactly
  who they counted before. A mentee paused in one clan and active in another stays a single
  active row — a greyed-out second copy of them would be a lie.
- **On the screen:** they sort last and are greyed in the rail with a pause badge instead
  of a present/absent one; the attendance tally reads `0/19 marked · 1 paused`; the
  attendance sheet and the side panel will not mark them, because nobody is expected at a
  review they are paused out of; and the profile card carries a **Paused** chip in place of
  the risk chip, an explanation, and **Bring back** where Pause used to be. Offering
  "Pause" on an already-paused mentee was the old behaviour, and it re-paused them.

**Files.** `server/src/services/mentorshipPauseService.js`,
`server/src/services/cohortService.js`, `server/src/controllers/cohortController.js`,
`server/src/controllers/mentorshipPauseController.js`,
`server/tests/mentor/paused-mentee-access.test.js`;
`client-interface/app/mentor/review/page.tsx`,
`client-interface/lib/hooks/mentor/useMentorCohort.ts`,
`client-interface/lib/services/mentor-api.ts`,
`client-interface/components/mentor/attendance/AttendanceSection.tsx`,
`client-interface/components/mentor/attendance/MenteeAttendanceCard.tsx`.

**Tests run.** 6 new cases in `tests/mentor/paused-mentee-access.test.js` → **26 pass / 0
fail** in that file.

**A second stale test was found and corrected** in the same file. It asserted that
`scopeOfMentee` prefers an active placement over a paused one; the service deliberately
stopped choosing — picking for the caller authorises against a clan they did not ask
about, and a standing clan grants different things from a cohort clan. **Confirmed failing
on the branch base before any of my changes**, so it was already red. It now asserts the
real contract, including that naming a clan resolves it either way.

**Verified end to end.**
- `GET /mentor/cohort` → 19 rows, none paused, `totals.mentees` 19.
  `?includePaused=1` → 20 rows, 1 paused, `totals.mentees` still 19.
- A finished clan: suggestions **200 with `[]`** (was 403); paused list **200, 1 row**; a
  clan the mentor does not run **still 403**.
- Browser, clan review: 20 chips with the paused one greyed and last,
  "0/19 marked · 1 paused", the Paused chip and banner on the card, **and no failed
  requests on the page at all**. Screenshot captured.
- Clicking **Bring back** produced "Sara Ali is back in the clan", the card dropped the
  paused state, the rail became `0/20 marked`, and the database row read `active`.

**Note on the suggestion itself.** The demo data cannot trigger one: a suggestion needs
three or more missed reviews (`INACTIVITY.reviewsBeforeFlag`) and the seeded clans only
hold two review sessions. The code path is reached — the request now returns 200 — but an
actual suggestion rendering on the card was **not** observed in the browser, only the
paused state was. Saying so rather than claiming otherwise.

### Issue 16 — nominations from every clan, on one clan's screen

**Root cause — two faults stacked on the same screen.**

1. **The portal was ignored.** `performanceNominationService.list` asked
   `authzService.hasAdminAccess`, which answers *does this person hold admin*. The
   reporter is a mentor **and** an admin, so it answered yes on their own mentor screen
   and the clan filter below it was skipped entirely — they were handed every nomination
   in the organisation. This is the same mistake issue 3 had, and the same correction:
   `actsAsAdmin`, which answers *which portal do they have open*.
2. **Nothing narrowed by clan.** The sidebar clan picker governs every other mentor
   screen. This one never sent a clan, so even a plain mentor read the nominations of
   every clan they mentor while looking at one of them.

**Fix.** `list` uses `actsAsAdmin` and accepts a clan, which the controller takes from
`?clanId=` or the portal's own `X-Active-Clan`. The narrowing is **subtractive**: naming a
clan can only remove rows, never add one the caller could not already see.

The heading changed with it. It said "Your nominations" and listed every nomination in the
clan, a co-mentor's included — which is deliberate, because the "Nominated" chip on the
roster above can only warn you that somebody has already been put forward if another
mentor's nomination is in that list. It now reads **"Nominations in &lt;clan&gt;"**, which is
what it is.

**Found next to it: an authorization hole.** `ranking` took a bare `clanId` and **no
caller at all**, so any signed-in mentor could ask for any clan in the organisation.
Demonstrated against the pre-fix code: the mentor of Node Guild requested MERN Fellows and
got **200 with all 20 mentees by name, with their scores and signals**. It now takes the
caller and checks the clan against their own scope first — the same mentor now gets 403,
their own clan still returns 20, and an admin still reads any clan.

**Files.** `server/src/services/performanceNominationService.js`,
`server/src/controllers/performanceNominationController.js`,
`server/tests/mentor/top-performer-nominations.test.js`;
`client-interface/app/mentor/top-performers/page.tsx`,
`client-interface/app/admin/top-performers/page.tsx`,
`client-interface/lib/services/top-performers-api.ts`.

**Tests run.** `tests/mentor/top-performer-nominations.test.js` → **20 pass / 0 fail**,
including 5 new cases: the clan narrowing, that it cannot be widened by naming a clan you
do not mentor, and the three ranking-authorization cases. The suite **caught my own
change** first — adding the `user` argument broke all 13 existing cases, which is how the
two internal `ranking` calls inside `nominate` and `aiDraft` were found still passing no
caller. They were fixed and re-verified by nominating through the live API (201).

**Verified end to end**, with a genuine mentor+admin account (an org `super_admin` role
granted to the seeded mentor in the local database for the test):
- Before: mentor portal, standing clan selected → **2 nominations, both from MERN
  Fellows** — exactly the report. After: **0**.
- Admin portal, no clan → still 2. The org-wide view is untouched.
- Browser: MERN Fellows selected → *"Nominations in MERN Fellows"*, 2 rows. Standing clan
  selected → the section is **not rendered at all**, and no failed requests.

### Issue 25 — a chat that opens half way up the thread

**First hypothesis, and it was wrong.** I expected a race: `loadMessages` sets the
messages, then *awaits* `markConversationRead`, and only clears the loading flag
afterwards — so for one round trip the component holds real messages while still
rendering three skeletons, and the one-shot scroll could fire against the skeletons'
height. That is a real fault and is now guarded, but **measured against the old code it
did not reproduce**: a 51-message thread opened cleanly at the bottom.

**Actual root cause: the unread banner was deciding where you land.** The open scroll
centred `#unread-banner` whenever one existed. Only the **last fifteen** messages are
fetched, so in any chat you have not opened for a while nearly all of them are unread and
the banner is the *first* thing in the loaded window — the offset comes out negative, the
browser clamps it to zero, and the chat opens at the very top of what it loaded. That is
the report's screenshot exactly, scrollbar at the top.

Measured on a thread with 14 unread, same content both times:

| | `scrollTop` | distance from the bottom |
| --- | --- | --- |
| Before | 0 | **1121px** |
| After | 1121 | **0** |

**Fix.** A freshly opened conversation starts at the bottom, always. The banner still
renders where it belongs — that part was worth having — it just no longer decides the
scroll position, because the newest message is what you opened the conversation to read.
The bottom is then *held* rather than jumped to once: a `ResizeObserver` re-pins while
late avatars and web fonts add height, and lets go the moment the reader scrolls up.
Sending always returns to the end; loading older messages never drags the reader anywhere.

**Found while reproducing it — a page-level crash.** The Messages screen rendered
**"Something went wrong"** and nothing else. `next/image` validates `src` against
`images.remotePatterns` in `next.config.js` and **throws during render** when the host is
not listed; a throw in render takes the whole page down. Only `res.cloudinary.com` is
configured, so every other avatar host there has ever been — an OAuth provider's CDN, a
Gravatar, anything a migration left behind — is one row away from doing this. Three
messaging components used it for profile photos while `components/shared/Avatar` already
existed and already handles a failed URL with an initials fallback. All three now use it,
`next/image` is gone from the client entirely, and a guard test keeps it out — the fault
only appears for the one user whose photo lives on the wrong host, so it would not be
noticed again until it shipped.

**Files.** `client-interface/components/shared/messages/ChatWindow.tsx`,
`components/shared/messages/ConversationList.tsx`,
`components/shared/messages/UserSearchCombobox.tsx`,
`tests/no-next-image-for-user-photos.test.cjs`.

**Tests run.** Client guard suite **112 pass / 0 fail** (2 new). `tsc` clean.

**Verified in the browser**, with 40 extra messages seeded locally so the thread overflows:
opens at the bottom with the newest message in view, the unread banner still renders in
the thread, and the Messages page loads with **no console errors** where it previously
rendered the error boundary.

**Trade-off, stated.** Jumping to the first unread message is gone. The report asked for
the bottom in as many words, and the old behaviour was indistinguishable from a broken
page whenever the banner sat at the top — which is the common case, not the rare one.

### Issue 32 — an approved standing clan arrived empty

**Root cause.** `standingClanService.decide` carried the source clan's **mentor team** into
the new standing clan and nobody else. So the first thing a mentor did with the
continuation they had just been granted was retype a roster the system already knew —
every active mentee of the clan they had asked to continue. The request drawer even said
so out loud: *"The approved standing clan starts with an empty roster."*

**Fix.** Approval now carries the source clan's **active** mentees across, as the default,
and the mentor removes anyone they do not want afterwards — which is one click, where
choosing twenty people by hand is not.

Four things are deliberate about how:

- **Active only.** A paused mentee stopped turning up during the programme, and whether a
  continuation is the way to bring them back is a judgement for their mentor, who can add
  them by name. A removed one left.
- **Their work is not moved.** Re-pointing those rows would empty the completed
  programme's record and break the certificate awarded on it, which reads them live — the
  reason `priorRecord` gives for keeping history where it happened. The ordinary join
  carry runs instead, bringing forward unfinished work whose mentor came too. It is the
  same path as the manual "add mentees" button, so there is one definition of what joining
  a standing clan does.
- **After the transaction**, for the reason `addMenteesToStandingClan` already documents:
  it opens its own transaction and re-reads authorization, which would block on the clan
  row the decision has not committed yet.
- **One mentee at a time, never throwing.** The batch method is all-or-nothing by design,
  which is right when a mentor picked the names and wrong here, where a single suspended
  account would cost the other nineteen their place. The report asked for no errors: the
  decision is recorded and the clan exists whatever happens to the roster, and what could
  not be carried is counted and logged.

The mentor's approval notification now says how many came across instead of telling them
to go and choose, and the request drawer's copy says what actually happens.

**Files.** `server/src/services/standingClanService.js`,
`server/tests/admin/program-completion-standing.test.js`;
`client-interface/components/shared/StandingClanRequests.tsx`.

**Tests run.** 5 new cases → `tests/admin/program-completion-standing.test.js` **15 pass /
0 fail**; `tests/mentor/clan-standing.test.js` + `tests/clans` **51 pass / 0 fail**. The
new cases cover the move, that finished work stays in the clan it was done in, that a
paused mentee is left behind, that **a mentee who cannot be carried does not fail the
approval or cost the others their place**, and that a request with no source clan adds
nobody.

**A stale assertion was updated.** The same file asserted the approved clan starts empty —
that is the behaviour this issue asks to change — and its test name said "one fresh empty
clan". It now asserts the roster arrives, and still checks the thing it was really about:
cross-programme mentees added without transfers or enrollments.

**Verified against the demo database** end to end, then rolled back: programme closed →
request → approved → **19 active mentees carried, 0 skipped**, mentor team carried as lead
+ co-mentor, **297 tasks still in the source clan**, 17 continued into the new one. The
verification clan was then removed and the programme reopened; task counts and the active
roster are back to exactly what they were (397 tasks, 19 active mentees, no clan frozen,
no orphaned progress rows).

### Issue 17 — Insights → Reports disagreed with the other two tabs

**Root cause.** Insights has three tabs. Leaderboard and Progress scores were both moved
onto the server's single progress score some time ago — their own comments record why:
each page used to carry its own weighting, so one mentee had a different number depending
on which page you opened. **Reports was the one left behind.** It still computed, in the
browser:

- a *health score* of `avgProgress × 0.4 + avgOnTime × 0.3 + onTrackShare × 0.3`, banded
  at thresholds (78 / 58 / 40) that exist nowhere else in the product;
- a *Top performers* order sorted by `absoluteProgress + onTimeRate`.

Neither is the score. Measured on the demo clan:

| | Reports said | Progress scores / Leaderboard said |
| --- | --- | --- |
| Clan headline | **61** — "Steady" | **79** — "Strong" |

Eighteen points apart, with a label from a different vocabulary, on two tabs of the same
menu.

**Fix.** Reports reads `useClanPerformance` — the same hook, for the same clan, as the
other two tabs.

- The headline is now the clan's **average progress score**: the identical number the
  Progress scores tab prints as "Clan average". When the score has not placed anybody yet
  it says so rather than inventing an average.
- The bands are the server's (`Exceptional / Excellent / Strong / Developing / Needs
  attention`), so a label here cannot drift from the label there.
- **Top performers is the top of the same ranking**, shown with each mentee's rank, band
  and score, instead of a private sort.
- The clan is named under the dial, because a score only means something against the
  people somebody trains with.

What deliberately did **not** change: the throughput block (tasks completed, on-time rate,
blockers opened and resolved over the week or month) and the "Needs attention" list. Those
are period facts and the server's own risk field, not competing composites — the issue is
about the score, and widening it would be redesigning a page that was asked to be made
consistent.

**The profile pictures.** `/mentor/scores` — the Progress scores tab, the one Insights
view that lists the whole clan — rendered initials in a coloured circle and nothing else,
although `/performance` returns `profilePictureUrl` for every mentee and the Leaderboard
has always shown it. It now uses the shared `Avatar`, in both the ranked table and the
"Not scored yet" list. Reports' own private avatar component went the same way, so the
page no longer carries a second copy of something `components/shared/Avatar` already does.

**Files.** `client-interface/app/mentor/reports/page.tsx`,
`client-interface/app/mentor/scores/page.tsx`.

**Tests run.** Client guard suite **112 pass / 0 fail**; `tsc` clean.

**Verified in the browser** on the demo clan:
- Reports now reads **79 / 100**, matching the Progress scores "Clan average" of **79**.
  The old formula produced **61** on the same data.
- Reports' Top performers reads **1 Maya Patel 95 · 2 Lina Haddad 92 · 3 Mei Lin 92**,
  which is exactly the server ranking the Leaderboard shows.
- Progress scores renders **18 photographs** where it previously rendered none.

**Honest note on the podium.** On this dataset the old sort happened to name the same
three people in the same order — the demo mentees are cleanly separated, so both orderings
agree. The *formula* was different, which is what was fixed; I did not observe the two
orders diverging, only the two headline numbers.

### Issue 26 — Plan &amp; usage contradicting itself

**What the screenshot shows.** Usage reads **1089 / Unlimited**, **1 / Unlimited**,
**46 / Unlimited** — directly above a Growth card, marked *Current*, promising **1500
members, 15 programs, 60 clans**. Both halves of the page describe the same plan and give
different answers, so the only conclusion available to an admin is that the numbers are
wrong.

**Root cause.** Both halves are reading different things and neither says so. The usage
bars use `subscription.plan.limits`, which is the plan's limits **with this workspace's
overrides merged over them**. The plan cards use the plan row as published. When a
workspace has been given custom limits — which is what "Unlimited" against a Growth plan
means — the page states both numbers and reconciles neither.

Reproduced locally by setting `overrides.limits` to unlimited on the demo workspace: the
page rendered exactly the screenshot, "31 / Unlimited" above a card saying 1500.

**Fix.** The service now reports `overriddenLimits` — the keys whose enforced value
actually differs from what the plan publishes — and `publishedLimits` alongside the
effective ones. A workspace with no overrides sends an empty list and nothing about it
changes. On the page:

- an overridden usage card says **"Custom limit for this workspace · Growth publishes
  1500"**;
- a one-line notice explains that the figures above are the enforced ones;
- the **current plan's card shows what is actually enforced**, marked *custom here*, so
  the two halves of the page can no longer state different numbers for the same thing.

**Two more defects found in the same component.**

- A limit the plan does not define rendered as **`31 / NaN`**. `Number(undefined)` is NaN
  and NaN fails every comparison, so the `< 0` unlimited check silently fell through. An
  absent limit now means no limit.
- **"the selected plan is shown wrong":** the plan cards list only `active: true` plans,
  while the subscription has no such filter. A workspace sitting on a plan that has since
  been retired read *"Current plan: X"* above three cards, **none of them marked Current
  and none of them X**. Its own card is now added when the published list does not contain
  it — with its limits trimmed exactly as `/plans` trims every other plan, so a retired
  plan's card cannot become the one place the unpublished entitlements (storage, AI quota)
  are advertised.

**Files.** `server/src/services/organizationService.js`,
`server/tests/organizations/tenant-isolation.test.js`;
`client-interface/components/settings/PlansSettingsTab.tsx`,
`client-interface/lib/services/organizations-api.ts`.

**Tests run.** 3 new cases → `tests/organizations/tenant-isolation.test.js` **20 pass / 0
fail**. `tsc` clean, client guard suite 112 pass.

**Verified in the browser**, all three states, and the workspace put back afterwards:
- no overrides → **31 / 1500**, no notice, card unchanged;
- overridden → **31 / Unlimited · "Custom limit for this workspace · Growth publishes
  1500"**, the notice present, the Growth card showing the enforced numbers;
- plan retired → the Growth card still appears, still marked **Current**, with only the
  three published limits on it.

**What I could not verify.** The member and clan counts themselves (1089, 46) come from
`OrganizationMembership.count({ status: 'active' })` and a count of clans through their
programme. Those are straightforward counts and I found nothing wrong with either, but
this workspace has 31 members and 3 clans, so a 1089-member miscount is not reproducible
here. **If the counts are still wrong after this, the remaining problem is in what those
two queries count, not in how the page shows it** — tell me what the number should be and
I will chase it.

### Issue 12 — Points &amp; badges, three lists that each outgrew the screen

**Root cause — in two opposite directions.**

- **The leaderboard and the points history were capped and silent.** The page fetched the
  top **10** standings and the last **12** points entries, with no control to see any
  more and nothing saying there was more. A mentee ranked 13th of 24 **could not find
  themselves on their own leaderboard** — the row did not exist in the browser at all —
  and their points history simply stopped twelve entries ago.
- **Earned badges had no cap at all.** Every badge rendered as a full-height card, so the
  section grew without limit.

**Fix.** All three are paged with the same `usePagination` + `TablePagination` the mentor
tables use, so the control behaves as it does everywhere else: 10 standings, 6 badges, 10
history entries per page, and the pager only appears when there is a second page. The
fetches are raised to 100 so there is something to page through.

The leaderboard additionally **opens on the page you are on**. Landing on page one of a
standings table you are not in is the same as not being shown it.

That jump needed a second effect, which is worth recording: `goToPage` clamps against the
paginator's `total`, and inside the effect that *sets* the total that value is still the
previous render's zero — so the first attempt clamped straight back to page one. Waiting a
render for the total costs nothing and makes the jump actually happen.

**Also:** the leaderboard rows carried a rank number and a name and nothing else, although
the server has always sent `profilePictureUrl` with every entry — the client type simply
did not declare it. Faces are the fastest way to find a person in a list of a hundred, so
they are there now, via the shared `Avatar`.

**Files.** `client-interface/app/mentee/gamification/page.tsx`,
`client-interface/lib/services/gamification-api.ts`.

**Tests run.** Client guard suite **112 pass / 0 fail**; `tsc` clean.

**Verified in the browser** as a mentee ranked **13th of 24**:
- the leaderboard opens on **page 2**, showing ranks 11–20 with **"13 · Ivan Petrov · You"**
  highlighted — a row that did not previously exist in the browser at all;
- the pager reads **1 2 3**, and **24 photographs** render where there were none;
- with 10 badges seeded locally, Earned badges reads **"Showing 1 - 6 of 10"** across two
  pages. The seeded badges were removed afterwards.

### Issue 11 — "feedback is smooth, notification / what's new is not"

**Root cause.** Three sheets sit on the same sidebar rail and there were three
implementations of a slide-over between them.

- **Feedback** uses `components/shared/Drawer`: mounts, waits two frames so the off-screen
  transform paints, then slides in over 250ms, and stays mounted to slide back out.
- **Notifications had no animation at all.** `isMounted && isOpen && createPortal(...)`
  put a full-height panel on screen in a single frame — no transform, no transition, no
  exit. That is the whole of the complaint: one of them was animating and one was
  appearing.
- **What's new** was a near-copy of the shared Drawer — its own backdrop, its own
  two-frame slide, its own 250ms constant, its own Escape handler and scroll lock.
  Correct, and a third thing to keep in step.

**Fix.** Both now use the shared `Drawer`. One timing constant, one focus trap, one scroll
lock, one Escape handler, one backdrop. The sheets on that rail cannot feel like three
different products any more, and a change to the motion is one change rather than three.

This removed, from the notification drawer alone: a hand-rolled focus trap (tab-cycling
and focus restore), its own Escape listener, its own portal-mount guard, its own backdrop
and panel markup. From the what's-new drawer: the duplicate enter/exit effect, the
duplicate scroll lock and the duplicate Escape listener.

**Files.** `client-interface/components/shared/NotificationDrawer.tsx`,
`client-interface/components/shared/ChangelogDrawer.tsx`.

**Lint improved, not just unchanged.** Those two files carried **3 errors and 1 warning**
before (two of them `setState` called synchronously inside an effect — the cascading
render that makes an opening panel stutter). They now carry **2 errors and no warnings**,
and both remaining errors predate this work. The React-compiler memoization error in
`NotificationDrawer` is untouched and out of scope here.

**Tests run.** `tsc` clean; client guard suite 112 pass.

**A third cause of the same complaint, found while measuring it.** The drawer rendered
**every** notification the feed held — on a busy account, hundreds of cards laid out in
the same commit that opens the panel, before the first frame of the slide can paint. No
transition survives that. The drawer is a peek and there is a "View all" button at the
bottom going to the page that *is* the list, so it now shows the most recent 20 and
offers "N older notifications — see them all".

**Verified in the browser**: all three triggers now produce a panel carrying
`data-drawer-motion` with `transition-duration: 0.25s` — the shared component — where
notifications previously had no animated panel in the DOM at all.

**Measurement I could not get.** I tried to sample the panel's transform frame by frame
to show the slide itself. In headless Chrome the panel was already at its final transform
by the first sample I could take, and I could not tell that apart from the browser not
compositing the transition at all, so **I am not claiming a measured slide** — only that
the three sheets now render the same animated component with the same timing, where one
of them rendered none.

**Note on scope.** This makes the three consistent by making them one thing. It is also a
concrete piece of issue 30 ("we have no reusable components… drawers… these are just the
examples"), paid for by a defect rather than by a refactor nobody asked for.

### Issues 14 and 27 — the review lock was all-or-nothing, and yellow

These are one change: both ask for the cohort-review deletion lock to apply per programme
or per clan instead of only to the whole organisation, and both ask for the yellow to go.

**Root cause.** The lock was a single boolean in `system_settings`. An admin protecting
the records of a programme that had just closed had to freeze deletion for **every mentor
in every clan**, including the ones mid-cohort. The grants an admin hands back had the
same problem in reverse: a grant was org-wide, so answering *"yes, fix that one session"*
also handed the mentor every other clan they run, for as long as the grant lasted.

**Fix — the lock gained a scope.** Deletion is locked for a session when **any** of these
holds: the organisation-wide flag is on, **or** its clan is locked, **or** its clan's
programme is locked. Locks only ever add; a grant only ever subtracts, and has the same
three scopes.

**Migration 133** adds `cohort_review_locks` (one row per locked programme or clan — the
row *is* the lock, so there is no "locked: false" row to disagree with a missing one) and
`scope_type` / `scope_id` on `cohort_review_unlock_grants`. **The org-wide flag does not
move**: it stays in `system_settings`, so every workspace keeps the lock it had, and every
grant written before this has no scope, which is exactly what org-wide already meant.

**A grant now covers no more than was asked for.** When the mentor's request names a
session, the grant defaults to that session's clan. An admin can still widen it, and
`scopeType: 'organization'` is the old behaviour, named.

**One ordering change worth noting.** `deleteSession`/`reopenSession` called
`assertCanDelete` *before* resolving the session, so the clan was not yet known. The
session is resolved first now — which also means a mentor who may not touch a session is
told *that*, rather than told it is locked.

**The yellow.** A lock that is deliberately on is a normal, intended state, not a warning;
dressing it in the colour the product reserves for "something needs your attention" made a
correctly configured workspace look broken. Amber also has the worst contrast of any
accent in the palette on a tinted panel, which is the accessibility half of #27. The card,
chip and switch are brand/slate tokens now, the switch gained a visible focus ring, and
**no element on the page carries an amber or yellow class** (checked in the browser).

**Files.** `server/scripts/migrations/133_scoped_review_locks.js`,
`server/src/models/scheduling/CohortReviewLock.js`,
`server/src/models/scheduling/CohortReviewUnlockGrant.js`,
`server/src/services/cohortReviewLockService.js`,
`server/src/services/cohortReviewService.js`,
`server/src/controllers/reviewLockController.js`,
`server/tests/admin/review-lock-scopes.test.js`;
`client-interface/components/settings/ReviewLockTab.tsx`,
`client-interface/lib/services/review-lock-api.ts`.

**Migration 133 has not been run on production.** Applied to the dev and test databases;
idempotent, with `--dry-run` and a working `--rollback`.

**Tests run.** 13 new cases → `tests/admin/review-lock-scopes.test.js` **13 pass / 0
fail**, covering each scope in isolation, a programme locking the clans inside it, the
org-wide flag still answering as it always did, locking twice being the same state,
unlocking, a bad scope being refused, a clan grant not covering the clan next door, a
programme grant covering the clans inside it, **a scopeless legacy grant still being
org-wide**, and expired/revoked grants lifting nothing. `tsc` clean.

**Verified end to end** against the demo data:
`MERN clan locked → MERN true (clan), Node Guild false`;
`their programme locked → both true (program)`;
`org-wide → both true (organization)`;
a grant for the wrong clan does not cover MERN, one for the right clan does, and a
scopeless grant covers both. The admin API round-trips (`200`, one row after locking
twice), and the page renders the new section with the picker.

### Issue 22 — an admin could not make a standing clan

**Root cause, in one line.** `clanService.createClan` refused `kind: 'standing'` unless the
call came from an approved mentor request:

```js
if (data.kind === 'standing' && !standingApproval) throw new ValidationError(
  'Standing clans are created by approving a mentor request');
```

That rule is right for a mentor — they ask, an admin decides — and it was written against
the **code path** rather than against **authority**, so the person who makes the decision
was the one person who could not act on it. The admin's own "New clan" drawer had no kind
field at all.

**Fix.** The actor travels with the call, and the rule asks the question it means: an
admin may create a standing clan directly; anyone else still has to go through a request.
The plan entitlement (`assertStandingClanPlan`) is checked on this path too — an admin
skipping the request flow must not also skip the gate.

The admin create drawer gains a **Kind** picker with a line of explanation for each
("runs with the programme, capped at 25" vs "open-ended, no cap, no programme enrolment"),
since the difference decides whether work counts toward the programme record.

**Files.** `server/src/services/clanService.js`, `server/src/controllers/clanController.js`,
`server/tests/clans/standing-request-per-clan.test.js`;
`client-interface/app/admin/clans/page.tsx`, `client-interface/lib/services/clan-api.ts`.

**Tests run.** 3 new cases → `tests/clans/standing-request-per-clan.test.js` **49 pass / 0
fail**: an admin creates one directly and it is uncapped, a non-admin asking directly is
still refused, and a call with no actor at all is still refused.

**Verified over the API**, then cleaned up: admin → **201, `kind: standing`**; admin →
201 cohort; a mentor without `clan.create` → **403** before the kind rule is even reached.
The seeded mentor who *does* hold admin in this workspace correctly succeeds, which is
how I noticed the demo data had given her that role.

### Issue 19 — two icons instead of three modes

**Root cause.** Assigning asked the timing question twice. A three-way segmented control —
*Assign now · Schedule once · Repeat weekly* — decided what **kind** of assignment it was,
and **below it** a separate "Due" block with its own presets and date input decided the
deadline, but only in one of the three modes. So half the form appeared and disappeared as
you clicked around it. The mode was a question about the system; the mentor's question is
"when is this due, and does it happen again".

**Fix.** A task is a one-off, assigned now, unless you say otherwise — which is what the
report asked for ("by default its once"). One icon sets the deadline, the other sets the
repeat, and a line underneath reads the two of them back as a sentence:

> **Due in 7 days** · **Repeats every weekday** — *Assigned every weekday, each one due 7
> days later.*

No reminder icon: the product already notifies, and a third control for it would be a
setting nobody asked for.

The two menus use the shared `Dropdown`. The due menu offers Today / Tomorrow / In 3 days
/ In a week / In two weeks / pick a date; the repeat menu offers Does not repeat / Daily /
Every weekday / Weekly on *today* / pick the days. Setting a repeat carries the deadline
across as each occurrence's offset, so the two controls cannot contradict each other.

**The underlying contract is unchanged.** `TaskScheduleDraft` and the `/api/tasks/custom`
payload are exactly what they were — this is a new presentation over the same two facts,
so nothing on the server moved.

**Files.** `client-interface/components/mentor/TaskTimingRow.tsx` (new),
`client-interface/components/mentor/AssignTaskDrawer.tsx`.

**Verified in the browser, end to end.** The three old controls are gone ("Assign now",
"Schedule once", "Repeat weekly" and "When should this happen?" all absent). Choosing
*Every weekday* and submitting posted
`{"schedule":{"mode":"weekly","daysOfWeek":[1,2,3,4,5],"dueOffsetDays":7,…}}` to
`/api/tasks/custom`, the drawer closed, and the recurring slot was written to the mentee's
schedule. The verification task was removed afterwards. No console errors.

**Scope, stated.** This is the **assign** drawer, which is what the report names. Two
other screens still use the old `TaskScheduleFields`: the task-edit drawer, where the
question is genuinely different ("should this existing task have future assignments"), and
`/mentor/schedules`, which is issue 20's page. **A course keeps a plain deadline** — it is
enrolled on the provider the moment it is assigned and cannot repeat.

**One capability is gone, deliberately.** "Schedule once" meant *assign this later*, and
the report asked for those three to be removed. A future deadline is still available
through the date picker; what no longer exists is holding a task back from the mentee
until a date. Say the word and I will put it back as a third item in the due menu.
