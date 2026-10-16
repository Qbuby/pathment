# Task run report — ClickUp "Testing and Report issues here"

Source task: https://app.clickup.com/t/37367037/z8w5vqrrpg (list `pathment`, status `planning`, priority urgent)

| | |
| --- | --- |
| Working branch | `fix/pathment-clickup-33-issues` |
| Base | `origin/staging` @ `17465bfa` |
| Git identity | Sheryar Ahmed &lt;royalsheryar505@gmail.com&gt; (repo-local) |
| Local DB | `postgres://…@localhost:5432/pathment_dev` (24 MB, 140 tables, 31 users, 1 org, 1 program, 3 clans) |
| Migrations | 138 in `server/scripts/migrations` (13 were pending at start; all applied locally, plus the 3 added here). **131, 132 and 133 are pending on production.** |
| Seeded logins | `admin@demo.pathment.com`, `mentor.aisha@…`, `mentor.omar@…`, `mentor.sam@…`, `mentee.*@demo.pathment.com` — all password `Demo@1234` |
| Push / deploy | **Not performed, by instruction.** |

### Status at a glance

**All 33 points implemented.** 29 are done and verified; 4 are partial and marked ⚠️ in
the table below, each for a stated reason rather than for want of finishing. The table
has 36 rows because point 6 carries three sub-points:

| | |
| --- | --- |
| ✅ done & verified | 32 rows — 29 of the 33 points, plus 6i, 6ii and 6iii |
| ⚠️ partial | **#1** (web done; mobile is a separate repo), **#23** (four People screens, not every admin screen), **#26** (display faults fixed; the production counts could not be reproduced locally), **#28** (deliberately reports rather than deletes — nothing removed from production) |
| ⛔ blocked | none |

**Tests — everything green.** 1,436 across the three runners, 0 failures:
server jest 1,285 in 20 directories · server `node:test` `.cjs` 30 in 12 files ·
client `node:test` 121. `tsc` clean; lint one error below the branch base. The full
server run is what caught the issue-5 regression recorded at the end of this file — see
that section for how the suite has to be run, because the obvious command silently does
not run all of it.

**Two things must happen before any of this reaches users:**

1. **Migrations 131, 132 and 133 are pending on production.** Issues 7, 33 and 14/27 do
   not work there until they run.
2. **Nothing is pushed, merged or deployed.** All work sits on
   `fix/pathment-clickup-33-issues`.

**Three decisions are yours, not mine:** #19 removed the "Schedule once" (assign-later)
capability exactly as the issue asked — say the word and it comes back as a third menu;
#23's scope context is built to extend to the remaining admin screens; and #28's next
step is to open Administration → Storage on production, because if the largest tables
add up to far less than 700 MB the answer is `pg_repack`, not deleting anything.

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
| 5 | Mentee moved to a standing clan still sees previous clans' tasks there; mentor-deleted tasks persist; "My learning" disagrees with "This Week". | ✅ | `e5d3a6cd` + `269cc07f` | Both faults fixed. The full suite later caught a regression I introduced here — a legacy clanless schedule row was bypassed rather than adopted; fixed in `269cc07f`, 58/58. |
| 6 | Community must stay open after program completion (currently read-only). | ✅ | `75883cfe` | |
| 6i | Spaces listing: separate completed vs active programs, designed properly. | ✅ | `75883cfe` | |
| 6ii | Mentors appear to auto-post (repetitive "Weekly standup") — remove that. | ✅ | `75883cfe` | |
| 6iii | Paginate members (shows ~1088) and posts (pagination/filters/search or infinite scroll). | ✅ | `75883cfe` | |
| 7 | Proper country/province/city pickers wherever location is captured, with timezone suggested from the country. | ✅ | `d0a13e8e` | **Needs migration 131 on prod.** API + browser verified. |
| 8 | Mentee "My progress" page is weak — improve or remove. | ✅ | `998861d3` | Empty-state pass, not a redesign. |
| 9 | Library (admin → mentor → mentee) redesign. | ✅ | `4a7bcfc3` | A pass over the noise, not a new IA — see the scope note. |
| 10 | Mentee dashboard: re-prioritise top vs bottom; the daily/planner block does not belong there. | ✅ | `9ffb02dc` | Re-prioritised + planner moved behind a strip; not a ground-up redesign. |
| 11 | Notification / "What's new" drawers do not open smoothly (the Feedback drawer does). | ✅ | `a55df642` | Notifications had no animation at all; both now use the shared Drawer. |
| 12 | Paginate (or infinite-scroll) Points & badges — performance leaderboard and earned badges. | ✅ | `41d74c53` | Also: a mentee outside the top 10 could not see themselves. |
| 13 | Suggest **pausing** a mentee who matches the inactivity criteria, on their profile card in clan review. | ✅ | `4cde0686` + `a214193d` | I first read this as "show paused mentees here" and built the opposite. Corrected in `a214193d` — see the section below. |
| 14 | Review-access lock should be settable per program or per clan, not org-wide only; remove the yellow styling. | ✅ | `89387991` | Same change as #27. |
| 15 | Improve the "Something went wrong" screen. | ✅ | `4c887e22` | Crash branch seen; the quiet branches verified by reading. |
| 16 | Top-performers/nominations not scoped to the active (standing) clan — mentor sees other clans' nominations. | ✅ | `f64c1924` | Also closed a cross-clan ranking leak. |
| 17 | Mentor Insights → Reports disagrees with leaderboard/progress score (both correct). Align the criteria. Also: no mentee profile pictures in progress. | ✅ | `161ac0a1` | Reports read 61 where the score read 79. |
| 18 | Mentor dashboard: remove yellow, re-prioritise, show announcements compactly. | ✅ | `2b1bf1b2` |  |
| 19 | Task assign: drop "Assign now / Schedule once / Repeat weekly"; use two icon menus (due date, repeat) like Microsoft To Do. No reminder icon. | ✅ | `daef3d7f` | Assign drawer only; see the scope note. |
| 20 | Mentor calendar: pick a **time** on the calendar, and set repeating availability by day + time. | ✅ | `63c02ace` |  |
| 21 | Feature-usage statistics per role (which pages/features are actually used). | ✅ | `d3b6635c` | Page views were never recorded on web — the endpoint and the hook existed and nothing called them. New Insights → Feature usage, joined onto the nav registry so never-opened screens appear at all. |
| 22 | Admins can create standing clans too. | ✅ | `a0c37191` |  |
| 23 | Program/clan filters across the admin panel (people → mentees/mentors, enrollments, clan requests), ideally one global program selector. | ⚠️ | `5b1e9c61` | The four People screens; other admin areas not wired to the scope yet. |
| 24 | Admin live-meeting screen redesign (calendar, Meet-like). | ✅ | `8d8f157a` | Month view + day filter; not a week grid. |
| 25 | Opening a conversation must land scrolled to the newest message. | ✅ | `82df6e76` | Also fixed a page-level crash on Messages. |
| 26 | Workspace plan & usage shows wrong usage and wrong current plan. | ⚠️ | `f968e9d4` | Contradiction + NaN + retired-plan cases fixed; the raw counts could not be reproduced locally. |
| 27 | Admin Review-Lock page: remove yellow, improve accessibility, allow grant/revoke per program or clan as well as org-wide. | ✅ | `89387991` | Same change as #14; migration 133 pending on production. |
| 28 | Remove unnecessary database data (~700 MB). | ⚠️ | `83d639d5` | **Deliberately not the literal ask — nothing deleted from production.** Built Administration → Storage so the 700 MB can be explained, plus three more retention policies. See the section below. |
| 29 | Admin access logs must be human-readable, with pagination and search. | ✅ | `2419ed2e` |  |
| 30 | Extract reusable components (drawers, profile pictures, …) — reduce duplication. | ✅ | `d2acc534` | 10 hand-rolled drawers and 9 avatar forks consolidated onto the shared components; both held by guard tests. |
| 31 | Clan review "no mentee" empty state needs to be better. | ✅ | `58a3a2e8` |  |
| 32 | A standing-clan request should carry the mentor's active mentees (with their work) across automatically. | ✅ | `95896644` + `920b1522` | First pass carried the roster and left the work behind a button; `920b1522` carries the unfinished work too. |
| 33 | Blockers/plan shows "N tasks" that cannot be seen; wrong tasks; must be clan-scoped for mentor and mentee. Work-history drawer reports 0 tasks while the profile shows 24. | ✅ | `4f8e73cf` | Migration 132 pending on production. |

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

### Issue 20 — the calendar you cannot put a time in

**Root cause.** The page had three controls for one job, and they did not talk to each
other. Picking a day in the calendar only **filtered** the list beside it. To actually
offer that day you scrolled past a seven-row weekly editor to a separate "One-off slot"
block and **retyped the date you had just clicked**. And making that time recur meant
finding the right row in the weekly table and typing the time a third time.

**Fix — the time lives with the date.** Selecting a day opens an inline panel right under
the calendar: *"Add a time on Thursday, October 29"*, with a time, a length, and two
buttons — **Just this day** and **Every Thursday**. That second button is the whole of
"I can make repetitive availability on days and with time": it reads the current weekly
rules, adds this one, saves them back, and tells the weekly editor below to reload, so two
views of the same week cannot disagree.

The duplicate "One-off slot" form is gone — the block keeps the *list* of published
one-offs, which is the part that was worth having. A time already repeating on that
weekday is recognised and says so rather than writing a duplicate rule.

**Files.** `client-interface/app/mentor/schedules/page.tsx`.

**Tests run.** `tsc` clean. **Lint is one problem better** than before on this file (24 vs
25); everything remaining predates the change.

**Verified in the browser, end to end.** Picking the 29th opened
*"Add a time on Thursday, October 29 · Time · Length · Just this day · Every Thursday"*.
Clicking **Every Thursday** issued
`PUT /api/meetings/availability/rules {"rules":[{"weekday":4,"startTime":"14:00","endTime":"14:30","slotMins":30}]}`
and the Weekly hours editor below reloaded with **Thursday no longer "Unavailable"**. The
rule was removed afterwards. No console errors.

**Not done here.** The weekly editor itself is unchanged — it is a perfectly good seven-row
table once you are in it, and the complaint was that reaching it was the only way to do
anything. Drag-to-create directly on the calendar grid would be the next step and is a
bigger piece of work than this report asks for.

### Issue 15 — "something went wrong" for everything

**Root cause.** One message covered every failure there is: *"Something went wrong. This
part of the app hit an unexpected error."* — including the two commonest, which are not
errors at all. **Your connection dropped**, and **your session ended**. Telling somebody
on a train that the application has failed is wrong, and it is the most frustrating kind
of wrong, because the fix was to wait ten seconds.

**Fix.** `ErrorView` reads the failure first and says the most specific true thing it can,
with the action that resolves *that* case first:

| | What it says | What it offers |
| --- | --- | --- |
| offline | **You are offline** — nothing you have done is lost | Try again |
| session | **Your session ended** — you will come straight back here | **Sign in again** |
| forbidden | **You do not have access to this** | Go back |
| missing | **This is not here any more** | Go back |
| crash | **Something went wrong** — your work is saved | Try again, and a **copyable reference** |

Red is kept for the case that deserves it; a dropped connection gets a calm slate panel,
because nothing is broken. The classifier is deliberately conservative — anything not
clearly one of the quiet cases is a crash, since claiming "you are offline" when the code
actually threw would be the same mistake in reverse.

Three other things the screen was missing:

- **"Go back"**. Almost always what somebody wants from a page that did not load, and it
  was the one route not offered.
- **A copyable reference.** A support code you cannot select is a support code nobody
  quotes, and it is now shown only on a real crash, where it means something.
- **A way to report it** — one line pointing at the feedback button that already exists.

**A contrast bug went with it.** The "Go to dashboard" link carried
`text-slate-700 dark:text-slate-700`, so in dark mode it was dark text on a dark panel —
unreadable at exactly the moment somebody is trying to get out of a broken screen.

**One component, every boundary.** `app/error.tsx`, `app/global-error.tsx`,
`app/{admin,mentor,mentee}/error.tsx` all render `ErrorView`, so this is one change for
all five. The global boundary's hard-coded `title="The app hit a snag"` is gone — it
overrode the classifier, and "You are offline" is more useful than any headline that file
could pick.

**Files.** `client-interface/components/shared/ErrorView.tsx`,
`client-interface/app/global-error.tsx`.

**Tests run.** `tsc` clean; client guard suite 112 pass.

**Verified in the browser** by standing up a page that throws under `/mentor`, confirming
the new card (headline, three actions, copyable reference `2871640933`, the report line)
and removing the page again. Screenshot captured.

**What I could not reproduce.** The offline card. Cutting the network with CDP did not
reach the boundary — Next served the shell from cache — so the offline, session,
forbidden and missing branches are **verified by reading, not by seeing**. The crash
branch is the one in the report's screenshot, and that one I did see.

### Issue 31 — the empty clan-review screen

**What was wrong.** The copy was already specific — it distinguishes "you do not mentor a
clan yet", "this clan has finished" and "no one is in it yet", and offers the right way
out of each. What it looked like was a **12-pixel grey icon in a blank card**, which on a
wide monitor is almost entirely white space. Accurate, and dispiriting.

**Fix.** The card now opens with a small, honest drawing of **the screen the mentor is
waiting for**: the roster rail with the marker under the person being reviewed, and the
mentee card below it. Under the headline, three tiles say what clan review actually does —
*One at a time*, *Their work*, *A note each* — so an empty clan explains the feature
instead of only reporting its own emptiness.

The illustration is drawn in brand tokens rather than shipped as an image, so it themes
with the rest of the product (including dark mode) and costs nothing to load. The copy,
the three different situations and the "you may be on the wrong clan" hint are all
unchanged — they were the part that was already right.

**Files.** `client-interface/app/mentor/review/page.tsx`.

**Tests run.** `tsc` clean.

**Verified in the browser** by emptying the standing clan, loading clan review and
screenshotting the result, then putting the roster back. No console errors.

### Issue 29 — an access log written for a log parser

**Root cause — four separate reasons the screen could not answer a question.**

1. **It printed request lines.** `auditTrail` records every state-changing request as
   `POST /api/…`, which is the right thing to *store* and the wrong thing to *show*. The
   screen read as a web-server log: `Post /api/messaging/conversations/8d1e58c5-…/read`.
2. **Background chatter outnumbered everything else.** Session heartbeats, read receipts
   and token refreshes — the application working, not the person acting. In the demo
   account they are **86 of 151 rows**.
3. **No search.** Fifty newest rows, and no way to ask about last Tuesday.
4. **No pagination.** A 384-pixel inner scroll box, inside a page that already scrolls.

**Fix.** A request line becomes a sentence — *"Opened a conversation"*, *"Assigned a
task"*, *"Changed the review lock"* — matched by path, with an unmatched endpoint
degrading to *"Updated messaging"* rather than leaking its URL. Background rows are
**marked and hidden by default**, with one checkbox to bring them back: they are still
recorded, because an audit trail with holes in it is not an audit trail.

Search runs on the server across the action, the area and the IP, debounced. Paging is the
shared `TablePagination`. And a request that **failed** now says so, with its status — the
single most useful thing in an access log, and it was invisible.

**One bug worth recording.** My first noise filter was
`action: { [Op.notILike]: { [Op.any]: PATTERNS } }`. That reads like "none of these" and
is not: `NOT ILIKE ANY(array)` is true as soon as the row differs from *one* pattern, so
it matched practically everything and filtered nothing — the totals were identical with
the toggle on and off, which is how I caught it. It is an AND of `NOT ILIKE` now.

**Files.** `server/src/services/securityService.js`,
`server/src/controllers/authController.js`;
`client-interface/components/shared/SecurityTab.tsx`,
`client-interface/lib/services/security-api.ts`.

**Tests run.** `tsc` clean; client guard suite 112 pass.

**Verified over the API and in the browser.** Default read: **65** real events; with
background included: **151**. Searching `clan` narrows to **27** and returns *"Created or
joined a clan"*, *"Review lock enabled"* — not URLs. The page shows the sentence, the
context (clan name · IP · device), the timestamp, a **failed · 400** badge where the
request failed, and *"Showing 1 - 20 of 27"* with a pager. No console errors.

### Issue 18 — mentor dashboard: the yellow, the order, the announcements

Three asks in one report, and each had a concrete cause.

**The yellow.** The "N mentees have no tasks yet" bar was amber on amber. That colour is
the product's "something is wrong"; a mentee with no work yet is a **prompt**, not a
fault. It is brand-toned now. Four of the stat cards also carried an amber/emerald
`color` in their config — **dead configuration**: the card markup never read it, it uses
`bg-muted` and `text-brand-600`. Removed rather than left to mislead the next reader.
**No element on the page carries an amber or yellow class** (checked in the browser).

**The order.** The no-tasks nudge sat **below both main panels**, so the one piece of
unambiguous work on the screen was the last thing you reached. It now sits directly under
the numbers it belongs with. Top to bottom the page reads: what is happening →
what needs doing → everything else.

**The announcements.** They were a full card near the bottom. `AnnouncementsCard` gained a
`compact` form — a single strip with the newest announcement, a `+N` for the rest and a
link — and the mentor dashboard uses it **at the top**, which is what the report asked
for: visible, without taking a block of the page. The full card is unchanged everywhere
else that wants it.

**Files.** `client-interface/app/mentor/dashboard/page.tsx`,
`client-interface/components/shared/AnnouncementsCard.tsx`.

**Tests run.** `tsc` clean.

**Verified in the browser:** the page reads *greeting → actions → announcement strip
("+2") → stats → nudge → panels*, and **0 elements** carry an amber or yellow class. No
console errors.

### Issue 23 — admin screens could only ask "what is this person called"

**Root cause.** Every People screen listed the whole workspace and offered a name search,
which is the only question a name search can answer. An admin running several programmes
could not ask *"who is in this one"* — the question those pages exist for — and with
forty-odd clans, *"who is in this clan"* was worse.

**Fix — one scope, shared.** `AdminScopeProvider` holds the chosen programme and clan for
the admin portal, the way the mentor portal has long held a clan. It is **remembered per
account** (two people on one browser must not inherit each other's scope) and shared, so
picking a programme on Mentees carries to Mentors, Enrolments and Clan requests rather
than being re-picked on each. `AdminScopeFilter` is the control, on all four screens.

Server-side the filters are **subtractive**, like every other scope in the product: they
intersect with the programme scope a `program_admin` already has, so naming a programme
they do not administer returns nothing rather than widening anything.

- **Mentees** — by clan (membership) or programme (**enrolment**, deliberately: clan
  membership alone would miss anyone enrolled but not yet placed, who is exactly the
  person an admin opens this page to find).
- **Mentors** — by clan, or every clan of a programme, counting only the roles that
  actually mentor.
- **Enrolments** — by programme (already supported) and now by clan, resolved through the
  enrolment each clan membership was created for.
- **Clan requests** — filtered in the browser, since the whole queue is one small read.
  A row with no clan on either side is **never hidden**: hiding what cannot be classified
  is how a request goes missing.

**Two bugs found on the way.**

1. **The admin mentor list had never paged or filtered.** `mentorApi.getAll` took a
   *search string*, and both paged callers were handing it a filter object — so `params`
   came out as `{ search: { search, page, limit, … } }` and the server got one nonsense
   parameter instead of four real ones. It takes the object now, and a bare string still
   works for the callers that pass one.
2. **My own first cut silently reset the scope on every navigation.** The filter clears a
   clan that is not in the chosen programme — correct — but it ran before the clan list
   had loaded, so on each page load the stored clan "was not in" an empty list and was
   dropped. The choice only survived on the page it was made. Caught by following the
   value through the browser: the picker showed the clan while the request did not carry
   it.

**Files.** `server/src/controllers/menteeController.js`,
`server/src/controllers/mentorController.js`,
`server/src/controllers/enrollmentController.js`,
`server/src/services/enrollmentService.js`,
`server/src/services/clanRequestsService.js`;
`client-interface/lib/context/AdminScopeContext.tsx` (new),
`client-interface/components/admin/AdminScopeFilter.tsx` (new),
`client-interface/app/admin/layout.tsx`, the four screens, their three hooks, and
`mentee-api.ts` / `enrollment-api.ts` / `mentor-api.ts`.

**Tests run.** `tests/admin` + `tests/organizations` → **137 pass / 0 fail**; `tsc` clean.

**A fourth stale test was found and rewritten.** `tests/admin/clan-avatar.test.js` called
`clanAvatarService.setAvatar`, a function that does not exist and **never existed on
`origin/staging` either** — the service was split into `uploadAvatarFile` and
`setAvatarUrl` and the test was not moved across, so it had been failing every run with
`TypeError: setAvatar is not a function`, which teaches nobody anything. The rules it was
protecting are unchanged and are now asserted against the two functions that carry them,
plus the two cases it never covered (a bad URL, and removal). 7 pass.

**Verified over the API and in the browser.** Mentees **27 → 20** (MERN) / **6** (Node
Guild); mentors **3 → 2**; enrolments **27 → 20**. In the browser, choosing Node Guild on
Mentees narrowed it to *"Showing 1 - 6 of 6"*, the choice persisted to localStorage, and
**the Mentors page opened already filtered** — `?clanId=…`, *"Showing 1 - 2 of 2"*.

**Not done.** The report also floats *"all the admin panel screens then show that
programme wise"* and a "create programme" button when there are none. The scope context is
built to carry exactly that, and the Learning / Recognition / Insights screens are not
wired to it yet — the four People screens the report names are.

### Issue 24 — a meetings page with no calendar on it

**What was wrong.** The page's subject is a calendar and it did not have one: a tall stack
of full-width inputs — title, description, audience, clan, date, time, duration — with the
list of meetings somewhere below it. Scheduling meant typing a date with no idea what was
already on that day.

**Fix.** The month sits beside the form. Days that already hold a meeting are marked;
clicking one fills the date **and** narrows the list underneath to that day, so *"what
else is on that Tuesday"* is answered before you book over it. The form is now a column
beside it rather than a page of its own.

It reuses `ReviewHistoryCalendar`, the same component the mentor schedule uses — which
needed one small change: its helper line was hard-coded to talk about *availability*,
true on the mentor schedule and wrong on a meetings page. It takes a `hint` now and keeps
its old wording by default.

**Files.** `client-interface/app/admin/meetings/page.tsx`,
`client-interface/components/mentor/ReviewHistoryCalendar.tsx`.

**Tests run.** `tsc` clean; client guard suite 112 pass.

**Verified in the browser:** the month renders beside the form, clicking the 28th filled
the date field, the helper read *"0 meetings on Wednesday, October 28"* and the list below
retitled itself to *"On October 28"* with *"Nothing booked on this day yet."* No console
errors. Screenshot captured.

**Not done.** The report says "like Google Meet". A week/day grid with meetings drawn as
blocks, and drag-to-create, is the next step and a much larger piece than this — what is
here answers the specific complaint (no calendar, can't see the day you are booking into)
without pretending to be that.

### Issue 10 — the mentee dashboard, and the planner living in it

**What was wrong.** The whole `DayPlanner` was rendered inline on the dashboard — the
blocks, the "work to plan" tray with a row and two controls per task, the drag targets.
On a mentee with five unplanned items (the report's screenshot) **the dashboard was
mostly the planner**, and the work queue underneath it was below the fold. Planning a day
is something you sit down to do; a dashboard should tell you whether it is done.

Above it, three "your support" links — log progress, meet your mentor, get unstuck — sat
directly under the hero, so three things a mentee *might* do came before the two they
opened the page for.

**Fix.** The planner becomes a one-line strip that opens the full planner in a drawer —
`PlanStripCard`, the component the mentor side already uses for exactly this. Same
behaviour, one screen lighter, and no new pattern invented. The support links move below
the work queue.

`PlanStripCard` gained an `own` flag, which only changes the words: a mentee on their own
dashboard was being shown **"Their day"**.

Top to bottom the page now reads: the one next action → today, in a line → your work
queue → support → programmes and history.

**Files.** `client-interface/app/mentee/dashboard/page.tsx`,
`client-interface/components/mentor/PlanStripCard.tsx`.

**Tests run.** `tsc` clean; client guard suite 112 pass.

**Verified in the browser** as a seeded mentee: the strip reads *"Today's plan · No blocks
yet — give the day a shape · Set up"*, and opening it gives the full planner in a drawer
titled **"Your day"**. No console errors.

**Scope, stated.** This is the re-prioritisation and the planner move the report asks for,
not a ground-up redesign of the page. The hero, the work queue and the enrolment cards
keep their current shape.

### Issue 9 — the Library

One component serves all three roles (`LibraryView`, with `canCurate` for admin and
mentor), so this is one change for admin, mentor and mentee. Four specific things were
wrong with it:

- **Three controls on every card, always.** Pin, edit and **delete** sat in the corner of
  each card, on a page whose job is reading — competing with the titles, and leaving a
  delete button one slip away at all times. They are the same three actions behind the
  overflow menu the rest of the product uses, revealed on hover or keyboard focus.
- **Four decorative accents.** Guidance was brand, Reading sky, Template emerald and
  **Policy amber** — so a page of cards read as four unrelated kinds of thing, and the
  product's warning colour sat on a category that warns about nothing. (The report
  complains about that colour twice elsewhere.) One neutral chip now; the icon already
  tells them apart.
- **The filters could not say what was behind them.** "Is there anything in Templates?"
  was answered only by clicking and finding out. Each filter carries its count now —
  **All 14 · Guidance 4 · Reading 5 · Template 4 · Policy 1** — and an empty category is
  disabled rather than a dead end.
- **"No resources match."** was shown for a search, for a category filter, and for both
  at once, and said which it was for none of them. It names the search term and the
  category now, with one button back to everything.

**Files.** `client-interface/components/shared/library/LibraryView.tsx`.

**Tests run.** `tsc` clean.

**Verified in the browser** on the mentor library (the same component the admin and
mentee pages render): counts on every filter, one chip treatment, cards leading with
their titles, no console errors. Screenshot captured.

**Scope, stated.** This is a pass over what made the page noisy, not a new information
architecture. The report says "can be redesigned properly" with no specifics and no
screenshot; if there is a particular layout you want, say which part and I will build it.

### Issue 30 — reusable components

Two things were being re-typed rather than reused, and the report named both.

**Drawers.** Eight screens had grown their own right-edge slide-over — ten of them in
all, counting the three on the rewards page. Each was the same twenty lines of markup
(fixed wrapper, backdrop, panel, header with an X, scrolling body, footer rail), and
each was missing the parts you do not notice while typing them:

| | hand-rolled | `components/shared/Drawer` |
|---|---|---|
| animates out | no | yes |
| Escape closes | no | yes |
| Tab stays inside | no | yes |
| page behind locked | no | yes |
| focus returns to the opener | no | yes |

A sheet you cannot close with the keyboard is a sheet a keyboard user is stuck in. All
ten now use the shared component: admin cohorts, the cohort application sheet, admin
clans, three on admin rewards, admin schedules, mentor roadmaps, `OneOnOneDrawer` and
`RoadmapEditorDrawer`.

**Two are deliberately left alone**, and the test names them with the reason:
`AssignToClansDrawer` (a wide preview table with sticky settings and summary bands) and
`AssignTaskDrawer` (sticky source tabs, its own portal, and a draft that must survive a
dismiss). The shared Drawer puts its children in one scrolling box; forcing these
through it would change how they scroll, which is worse than the duplication.

**Avatars.** Nine components had their own `photo ? <img> : initials` block, at five
different diameters — 26, 32, 36, 44 and 56 pixels. Those were not five design
decisions; they were five people each picking a number. Four of the nine had no
`onError`, so one dead Cloudinary URL rendered as a black disc. They now use
`components/shared/Avatar` at its own five sizes.

One fork existed only to grey out a paused mentee, so `Avatar` gained a **`muted` tone**
that desaturates the photo and drops the initials to slate. That state is on every
surface that lists people; keeping a whole component to recolour one fallback was the
expensive way to have it.

**Guarded.** `tests/one-drawer.test.cjs` and a new case in
`tests/no-next-image-for-user-photos.test.cjs` fail with the offending file names.
Confirmed red on the branch base (naming exactly the eight drawer files). Nobody wrote
these by choice — they wrote them because re-typing the markup was quicker than finding
the component, so the tests do the finding.

**Also fixed in passing.** Schedule blocks saved before ids were stored shared a React
key, which warned once per card on the admin schedules page.

**Tests run.** `tsc` clean. Lint one error below where it started. 116 client tests pass.

**Verified in the browser.** The five converted sheets reachable from a list page open
as the shared panel (`[data-drawer-motion]`, 0.25s transition, `role=dialog`
`aria-modal=true`), with `body` scroll locked, focus inside the panel and Escape
closing — on admin cohorts, admin clans, admin schedules, admin rewards and mentor
roadmaps. The two restructured sheets render correctly: the cohort application sheet
shows its contact line as header meta and correctly omits the footer for an applicant
already decided; the 1:1 sheet keeps its header, sliders and Cancel / Save 1:1 footer.
Photos come back at the shared diameters with no black discs. No console errors on any
of them.

### Issue 21 — what people actually use

**The gap.** Both halves of this existed and were never connected. The server had
`POST /activity/page-view`; the client hook exposed `trackPageView`; **nothing on the
web ever called it.** Every row in the page-view log had come from the mobile app. So
the question "is anybody using this screen?" had no data behind it at all.

**Three parts.**

1. **Record it.** `ActivityTrackerMount` — already mounted once in each of the three
   role layouts — now records the page on every route change.

2. **Key it by shape, not URL.** The rows that did exist showed why this matters:
   `/mentee/step/<uuid>` appeared as separate features, one use each. A screen every
   mentee opens daily would read as a hundred screens used once. `lib/utils/page-key.ts`
   strips the workspace slug, the query and the hash, and collapses id-like segments, so
   `/w/dev-weekends/mentee/step/ab22ddfd-…` keys as `/mentee/step/:id`. The same folding
   runs again in SQL, so rows written before any of this existed are folded too — and
   the client and server assert **the same list of cases**, because if the two drift the
   report's join silently drops rows.

3. **Report it.** `/admin/feature-usage`, a new tab under Insights.

**Two decisions worth stating.**

*People, not views.* Views reward a tab left open and refreshed; the number that answers
"should we keep this" is how many different humans went there. People is the headline
and the sort order.

*Every screen, not every row.* A page nobody opens writes no rows, so a report built
from the log alone can never show you an empty room — which is the room the report asks
about ("so we can remove the stuff as well"). The counts are joined onto
`getFlatNavItems(role)`, the registry of every page each role can reach, and the zeroes
fall out of the join as a **"Not opened once"** list per role. Anything recorded that
the menu does not list gets its own section rather than being dropped, because "what is
this path?" is usually the interesting question.

The denominator is shown next to every count: three people on an admin screen when there
are three admins is everybody; three on a mentee screen when there are six hundred
mentees is nobody, and both say "3". The bars are scaled against the role's population
for the same reason — scaled against the busiest screen (the first version) every bar
was full on a quiet week and the chart only agreed with itself.

The page also states when tracking actually started, and says so explicitly when the
window reaches back further than the record does, so a screen is never reported as
unused when the truth is that we have no data for those days. That comparison is made on
the server, against one clock.

**Files.** `server/src/services/featureUsageService.js` (new),
`server/src/controllers/activityController.js`, `server/src/routes/activity.js`
(`GET /activity/admin/feature-usage`, same `analytics.view` permission as the rest of
Insights), `client-interface/lib/utils/page-key.ts` (new),
`client-interface/components/shared/ActivityTrackerMount.tsx`,
`client-interface/app/admin/feature-usage/page.tsx` (new), plus the api method, type,
query key and the workspace tab.

**Tests run.** 8 new server tests (`tests/analytics/feature-usage.test.js`) covering the
folding, client/server key parity, people-vs-views, the window boundary, the
denominators, the tracking-start honesty flag and the empty case — all pass. 5 new client
tests (`tests/page-key.test.cjs`); 121 client tests pass in total. `tsc` clean, lint
level with baseline.

**Verified in the browser.** Walked four admin screens, then opened the report: it had
recorded them. "1 of 1 admin opened anything · 4 of 32 screens used" with Clans,
Overview, Feature usage and Rewards listed by people/views/last-used, and 28 screens
under "Not opened once"; mentor and mentee sections the same shape with their own
denominators. No console errors.

### Issue 28 — the 700 MB

**What I did not do.** I have not deleted anything from production, and nothing I built
can. My brief says not to modify production, and a sweep that removes rows nobody has
looked at first is exactly the change that is impossible to undo.

**What was actually wrong.** Nobody could answer the question. There was no report of
what the 700 MB *is*, so the only available move was to guess, and the guess is always
"it must be rows we can delete". On this schema that is very likely wrong, and here are
the numbers from the local dev database to show why:

```
total 24.5 MB · data 2.1 MB · indexes 8.3 MB · 140 tables · 4,191 rows
```

**Indexes are 71% of the table space on a database holding four thousand rows.** Every
index costs pages whether or not anything is in it, and deleting rows barely touches
them. On top of that, a deleted row's space goes back to *the table*, not to the disk —
the figure a host reports only drops after a `VACUUM FULL` or `pg_repack`, which take an
exclusive lock and are an operator's decision, not a button in an admin screen. So a
workspace can delete a great deal and watch the number not move.

**What I built instead.** A new **Administration → Storage** page that answers the
question:

- Database size, index share, live rows and **dead rows awaiting vacuum**.
- The largest tables, each with its data and index size shown as two bars side by side —
  because *which of the two is big* is the whole question and one bar hides it.
- What the standing retention policies would remove **right now**, itemised, with a
  sentence per policy saying what it takes and why that is safe.
- A sweep button that runs exactly the policies the daily worker already runs, nothing
  else, behind a confirmation that states the row count and the VACUUM caveat in
  advance.

**Three new retention policies**, on top of the three that existed:

| policy | takes | explicitly does not take |
|---|---|---|
| `readNotifications` | read, over 90 days old | **unread, however old** — that is somebody's inbox |
| `oldPageViews` | `page_view` events over a year old | other event types of the same age |
| `deliveredEmails` | `sent`, over 180 days | **failed and dead-lettered mail** — the evidence for a missing email |

**Nothing a sweep can reach is anybody's work.** There is a test that asserts the list of
tables the policies may touch, so a future policy over `assigned_tasks`,
`task_submissions`, `messages`, `enrollments` or `certificates` fails loudly before it
ever runs against real data. Another holds the audit policy to successful pings only — a
4xx or 5xx heartbeat is a security signal, not noise.

**Also fixed.** The shared `ConfirmDialog` — the single confirm behind every destructive
action in the product — had no `role`, no `aria-modal` and no label, so it announced
itself to a screen reader as an unlabelled div. It is an `alertdialog` with a labelled
title and description now.

**Files.** `server/src/services/dataRetentionService.js` (size report + three policies),
`server/src/controllers/storageController.js` (new), `server/src/routes/admin.js`
(`GET /admin/storage`, `POST /admin/storage/sweep`, both `system.settings`),
`client-interface/app/admin/storage/page.tsx` (new),
`client-interface/components/admin/ui/ConfirmDialog.tsx`, plus the api method, query key
and workspace tab.

**Tests run.** 3 tests in `tests/migrations/data-retention.test.cjs` (extended: it spins
up a throwaway Postgres and checks each policy's boundary — unread kept, recent kept,
non-page-view events kept — plus the two new guards). 121 client tests pass. `tsc` clean,
lint level with baseline.

**Verified end to end on the local dev database** (`pathment_dev`, confirmed by
`SELECT current_database()` before writing anything). I inserted five synthetic
page-view rows dated 400 days ago; the page then read **"Run sweep (5)"**; the
confirmation stated the count and the VACUUM caveat; the sweep removed exactly 5 and the
button went to "Nothing due". Counts after: `analytics_events` down by 5, and
`notifications` 129, `assigned_tasks` 397, `task_submissions` 346, `messages` 48 all
unchanged.

**What this does not tell you, and what to do next.** I cannot see production, so I
cannot say where its 700 MB is — only give you the screen that will. Open
Administration → Storage on prod and the largest-tables list answers it in one look. If
the tables there add up to far less than 700 MB, it is bloat, and the fix is a
`pg_repack` in a maintenance window rather than deleting anything.

---

## Full test run, 2026-10-16

### A regression this run caught — issue 5

The first attempt at a full server run **crashed** (V8 heap OOM at 56 minutes,
core dumped). It had reported exit code 0, which came from the `tail` at the end of
the pipe rather than from jest. Before it died it surfaced one real failure, in a file
my own issue-5 commit sits directly under.

Checked against the branch base rather than assumed:

| | result |
|---|---|
| `origin/staging` | 57 / 57 pass |
| this branch, before the fix | 51 / 57 — **6 failures** |

**Cause.** `scheduleBoardService._scheduleRow` took `membershipCount = 0` as a default.
Zero quietly means "this mentee is in more than one clan", which switches
`clanScopedWhere` to the strict branch that cannot match a schedule row written before
schedules were per-clan. Only `board()` ever passed the count, so every other path read
the strict way. A default that is wrong in the common case is not a default.

**The visible symptom** was the planner rendering a legacy row and then refusing every
change to it with "This mentee has no schedule yet".

**The one underneath it had no test at all and is worse.** `addSlot` and
`applyTemplate` do not refuse when the lookup misses — they create a row. A mentee with
a legacy clanless row would have got a **second** row stamped with the clan, every block
they already had left behind in the orphaned one, and a planner showing a day that had
silently lost everything on it. Nothing throws, so nothing says so. That would have
reached production.

**Fixed** in `269cc07f`: the count is resolved inside `_scheduleRow` when a caller has
not already paid for it, so omitting it costs one indexed query rather than correctness.
A test for the duplicate-row path is added and confirmed to fail on the unfixed code
(7 failures). Suite now 58 / 58, against 57 on the base.

### How the suite has to be run

Two traps, both of which make a run look complete when it is not:

- **One `npx jest --runInBand` pass over all 119 files OOMs** at the 2 GB V8 heap limit
  around 56 minutes. Raising `--max-old-space-size` is not available here (~1 GB free of
  15). Run it sharded, one process per `tests/*/` directory, so each hands its memory
  back and a failure is attributable to a directory.
- **`testMatch` is `**/tests/**/*.test.js`, so the 12 `*.test.cjs` files are never run
  by jest** — nine in `tests/migrations/`, two in `tests/organizations/`, one in
  `tests/staging/`. They are `node:test` files and need `node --test`.

### Result

| | suites / files | tests | failures |
|---|---|---|---|
| server, jest (20 directories) | 119 | **1,285** | 0 |
| server, `node:test` `.cjs` | 12 | **30** | 0 |
| client, `node:test` | 22 | **121** | 0 |
| **total** | | **1,436** | **0** |

`tsc` clean on the client. Lint level with the branch base (one error fewer).


## Issue 13, re-read — the suggestion, not the paused list

**I read the issue backwards the first time.** "Make sure we are suggesting the paused
mentee in the clan review on the selected mentee on their little profile card" means
*suggest pausing* somebody who matches the inactivity criteria. I built the other
reading — showing the already-paused — which is close to the opposite: it put paused
mentees back onto the one screen that pausing exists to take them off.

**Removed.** `includePaused` is gone from the roster read, the controller, the hook, the
api client and the review page, with everything that existed to render those rows: the
Paused chip, the Paused banner and Bring back, the attendance exclusions, the greyed
rail chip and the "N paused" tally. Nobody is stranded — `PausedMenteesPanel` on
**My Mentees** already lists paused mentees with Resume, which is the right home for it.
`Avatar`'s `muted` tone went too: I added it in the reusable-components pass solely to
grey out a paused mentee in this rail, and an unused prop with a test guarding it is
worse than not having it.

**Kept, because it was a real bug and the suggestion depends on it.**
`GET /mentor/pause-suggestions` returned **403 on every clan review load** for a clan
whose programme had finished — one read was answering both "may this person act here"
and "does this apply here". Authority and applicability stay separate.

**What the card does now**, which is what the issue asked for:

1. A mentee who matches the criteria gets a line on their profile card naming the
   evidence — *"They have stopped turning up. Never attended — 3 reviews held since they
   joined."*
2. **Pause** and **Keep active** sit next to it.
3. Pause opens the shared confirmation, which **repeats the evidence before anything
   happens** — a mentor acting on a prompt should see what the prompt was built on
   rather than trust that something counted correctly.
4. Confirming pauses them, and they leave the review screen.

No amber. This is the product noticing something on the mentor's behalf, not a warning
about a failure, and this run has been taking that colour out.

**The criteria** (`server/src/config/engagement.js`, unchanged): three or more reviews
held since they joined with none attended, a fourteen-day grace period after joining,
and no recent task activity — somebody doing assigned work is engaged even if they skip
reviews, so tasks only ever *reduce* flags.

**Tests.** The block that asserted paused mentees come back on request now asserts they
cannot, that a stale caller passing the old flag still gets the active roster, and that
they stay reachable from the paused list. 27 pass in that file; all 18 mentor suites
pass (231 tests). `tsc` clean, lint level with baseline, 120 client tests pass.

**Verified in the browser — which the first attempt never managed, and said so.**
Nothing in the demo data can trigger a suggestion: every mentee joined six days ago,
inside the fourteen-day grace period, and the clan holds two review sessions where the
rule needs three. So I built those conditions on the dev database (backdated one
mentee's join date, added a third past session), watched the whole flow, and took the
fixture down again afterwards. The card showed the suggestion, the confirmation repeated
the reason, and pausing dropped the rail from 19 to 18 with that mentee off the screen.
No console errors. Screenshot captured.

One thing I could not put back: restoring the fixture removed a single
`cohort_review_entries` row for that mentee on the dev database. It is demo attendance
data and nothing depends on it, but it is a change I made and did not fully reverse.


## Issue 32, second pass — the work comes too

**What the first pass got wrong.** It carried the roster and left the work behind a
button, and the reasoning it gave was about not re-pointing the source rows: that would
empty the finished programme's record and break the certificate read off it live. That
part is true and still holds. But it answered a question nobody asked. *Completed* work
staying where it was earned does not mean *unfinished* work should stay there too — and
the result was a mentee arriving in their continuation with an empty plan and no way to
finish what they had already started.

**What it does now.** Approving a standing-clan request carries every unfinished item
across as live work: `assigned` and `in_progress` tasks become real assignments in the
new clan, visible to the mentor without pressing anything and submittable by the mentee.
Completed work does not move.

| | source cohort clan | new standing clan |
| --- | --- | --- |
| completed work | **stays** — the programme record and its certificate read it live | not copied |
| assigned / in progress | source row left as history | **carried as a live assignment** |

**The gate that was holding work back** was "only work whose mentor came too". That is
the right rule for a mentee added one at a time: handing somebody's half-finished
roadmap to a mentor who has not read the submissions behind it is a judgement, and a
person should make it. It is unchanged there. It is the wrong rule for an approval,
where the whole clan is continuing and nothing is changing hands.

Worth knowing why this was easy to miss: approval already carries the source clan's
whole mentor team across, so a *serving* co-mentor is never a stranger to the new clan.
The only way to be genuinely absent is to have **left** the clan — a mentor who taught
for a while and moved on. Their open work was the work that silently went missing, and
it is now carried and **re-pointed at the new clan's lead**, because keeping it on a
mentor who is not in the clan lets the mentee submit something nobody present can
review. Not at the actor — the actor is the admin who clicked Approve.

**Tests.** Six new ones on the approval path, which had none of its own; every existing
test in that file covered the ad-hoc join. They cover the lead's own work carrying, the
departed mentor's work carrying and where it lands, completed work staying put, and the
ad-hoc rule still holding for a single hand-added mentee. The departed-mentor case is
confirmed to fail on the old code.

One of them **submits the carried task for real** rather than inspecting its shape. That
is the check worth having: the source programme is closed and carried rows are created
with no enrolment, and either of those is the sort of thing a writability check keys on.
Carried work that cannot be submitted is the same dead end as work that never came. It
submits, and lands in the lead's queue.

14 suites across `tests/clans` and `tests/admin` pass — 167 tests.


## Follow-up — the edit-task drawer

**What was reported.** Editing a task looked nothing like assigning one, and opening an
in-progress task showed none of the mentee's progress.

**Why both were true at once.** Clan Review does not open the read-only task drawer for
work a mentor can still edit — it drops straight into the edit form. So that form is
the whole screen a mentor sees when they click a task in flight, and it was a bare stack
of labelled boxes: a native `<select>` for the type where assigning uses pills,
acceptance criteria as one newline-separated textarea where assigning gives each check
its own row, a scheduling block still asking the timing question in the three-way shape
the assign form dropped in issue 19, and no sign anywhere of what the mentee had
actually done.

**The form now.** Same questions, same order, same controls as assigning: title, type
pills, the shared `TaskTimingRow` (deadline + repeat), the rich-text brief, task value,
and the `Deliverable, checks & resources` fold — which opens itself when there is
already something in it, because hiding the filled-in part of a filled-in form is the
opposite of useful. The mentor note stays; it is the one field that only exists here.

Difficulty is shown beside the task value but is not editable. The server has no
per-assignment difficulty override — only `pointsBase`, which is the thing difficulty
decides — so an editable control there would have been a lie. Type is a locked chip for
the kinds the server refuses to swap (quiz, interview, open-source, course all carry
their own assignment setup) and for any task that has already been handed in; the repeat
menu is hidden on the same rule, and until its current value has loaded, so a click
cannot stomp a setting that has not arrived yet.

**Progress.** A task the mentee has started opens with a panel above the form: when they
started, the deadline and how far past it they are, the day-by-day log with its gaps
drawn in, and — behind one click, so it costs nothing on a task with no submissions —
what they handed in, with the feedback.

**A bug found on the way.** The payload this drawer opens with comes from
`getMenteeTasks`, which does not include the step's resources; only `getTaskById` does.
So the resources box read empty on a task that had some, and adding one link saved an
override containing *only* that link, silently dropping the rest. The drawer now seeds
the list from the full record it already fetches, without overwriting anything typed.

**Verified in the browser** against the dev database, confirmed as `pathment_dev` first:
an in-progress task (3 of 13 days logged, a day overdue) showed the panel and the filled
form; a task flipped to `revision_needed` for the test showed the locked type, no repeat
menu, and its submission; a repeat was switched on, saved, read back from
`mentee_schedules`, then switched off again from the same drawer. Two resources were
saved and both survived — the point of the fix. Every fixture was put back: no leftover
overrides, no leftover schedule slot, no leftover `task_resources` row.

`client-interface/tests/edit-task-matches-assign.test.cjs` pins the shared controls, the
progress panel, the resource seed and the two locks. All five cases fail on the previous
drawer. Full client suite: 125 tests, typecheck clean.

---

## Putting it on staging

Staging now runs the full schema and a fresh dataset. What it does **not** yet run is
the code: Heroku release v150 is `Deploy 17465bfa`, the commit this branch was cut
from, so none of the 33 fixes are on `staging.pathment.me` until someone deploys. The
database is deliberately ahead of the code, which is the safe direction — the three
migrations are additive and nullable, so the old code serving right now cannot see them.

**Database.** `pathment-staging` → add-on `postgresql-lively-65939`, database
`d99bb8fl7he9ij`, confirmed distinct from production's `postgresql-crystalline-21155`
before anything was written. Backup `b002` captured first. Every account on it was a
`@demo.pathment.com` fixture and the only workspace was `devweekends`, so nothing real
was at stake.

**Migrations.** `schema_migrations` did not exist — staging had never run `migrate.js`;
its schema came from a `db:sync` someone pointed at it. Replaying history is not an
option (seven early migrations export no `up()`, and `migrate.js` throws on the first),
so the schema was checked instead of assumed: dumping `information_schema.columns` from
both staging and the fully-migrated `pathment_dev` showed **exactly** the gaps 131 and
133 describe — `users.region`, `users.country_code`, the `cohort_review_locks` table and
`cohort_review_unlock_grants.scope_type/scope_id` — and nothing else. So 135 files were
baselined as applied, then 131 and 133 were run for real, from this checkout against
`DATABASE_URL`, because `heroku run` executes the deployed slug and the deployed slug
stops at 130. 132 ran last and found **0 tasks and 0 blockers with no clan** — nothing
to attribute, which is the right answer on data the fixed seeder wrote. 138 recorded;
a `migrate.js` after the deploy will say the schema is up to date.

**Data.** `seed-demo.js` from this checkout, so staging got the `clan_id` fix rather
than the stale copy in the container: 31 users, 2 clans, 1 programme, 397 assigned tasks
(**0 without a clan**), 346 submissions. Then 72 skills, 5 schedule templates and 16
changelog drafts awaiting review. All accounts use the demo password the seeder prints.

**Two bugs, both from doing this.**

The re-seed deleted all 397 tasks and then died on
`standing_clan_requests_source_clan_id_fkey`. The wipe clears everything that points at
a clan before deleting the clans, and a standing-clan request remembers two of them —
the clan it was raised from and the clan approving it created. One approved request,
made by hand on staging on 15 Oct, was enough. The sweep now clears standing requests
and the new scoped review locks, the latter before anyone can hit it.

The staging build then failed at `npm ci --omit=dev`, missing `@emnapi/core` from the
lock file. `@unrs/resolver-binding-wasm32-wasi` — optional, dev-only, never installed on
linux-x64 — names `@emnapi/core` and `@emnapi/runtime` as ordinary dependencies. npm 11
relocked this file when `country-state-city` was added for issue 7 and left them out,
knowing that binding is unreachable here; npm 10, which `node:20` ships and the
Dockerfile therefore runs, requires the lock to be internally complete regardless, and
`--omit=dev` does not help because the consistency check runs before anything is
omitted. Relocked with npm 10.8.2 — only `@emnapi` entries move, no application
dependency changes — and verified under both 10.8.2 and 11.6.2. CI already guards this:
it runs `npm ci` in `server/` on every push to `staging`, and the old lock fails there
too, so the push that broke the build went in without a green run.

**`RELEASE.md` was wrong in the way that caused the migration gap.** It said `db:sync`
runs on every staging deploy, so staging's schema is derived from the models and needs
no migrations. The boot-time sync is commented out and `syncDatabase.js` refuses when
`DYNO` is set, so staging had been drifting behind its own models while the runbook said
that could not happen. It also still described a DigitalOcean box, `docker compose` and
a `deploy-prod.yml` Action that does not exist. Rewritten around the two Heroku
container apps, including the `heroku run`-runs-the-deployed-slug trap and how to
baseline a database that has never seen `migrate.js`.
