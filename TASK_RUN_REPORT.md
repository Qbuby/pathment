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
| 4 | Loader/spinner differs between screens — use one loader everywhere. | ⬜ | | |
| 5 | Mentee moved to a standing clan still sees previous clans' tasks there; mentor-deleted tasks persist; "My learning" disagrees with "This Week". | ⬜ | | Evidence: This Week shows 5 (incl. a duplicate), My learning shows 1, for the same clan. |
| 6 | Community must stay open after program completion (currently read-only). | ⬜ | | |
| 6i | Spaces listing: separate completed vs active programs, designed properly. | ⬜ | | |
| 6ii | Mentors appear to auto-post (repetitive "Weekly standup") — remove that. | ⬜ | | |
| 6iii | Paginate members (shows ~1088) and posts (pagination/filters/search or infinite scroll). | ⬜ | | |
| 7 | Proper country/province/city pickers wherever location is captured, with timezone suggested from the country. | ⬜ | | |
| 8 | Mentee "My progress" page is weak — improve or remove. | ⬜ | | |
| 9 | Library (admin → mentor → mentee) redesign. | ⬜ | | |
| 10 | Mentee dashboard: re-prioritise top vs bottom; the daily/planner block does not belong there. | ⬜ | | |
| 11 | Notification / "What's new" drawers do not open smoothly (the Feedback drawer does). | ⬜ | | |
| 12 | Paginate (or infinite-scroll) Points & badges — performance leaderboard and earned badges. | ⬜ | | |
| 13 | Surface paused mentees in clan review on the selected mentee's profile card. | ⬜ | | |
| 14 | Review-access lock should be settable per program or per clan, not org-wide only; remove the yellow styling. | ⬜ | | Same feature as #27, seen from the mentor side. |
| 15 | Improve the "Something went wrong" screen. | ⬜ | | The screenshot also evidences a real crash on Recognition → Top performers with "All clans". |
| 16 | Top-performers/nominations not scoped to the active (standing) clan — mentor sees other clans' nominations. | ⬜ | | "Not ranked yet" is correctly scoped; "Your nominations" is not. |
| 17 | Mentor Insights → Reports disagrees with leaderboard/progress score (both correct). Align the criteria. Also: no mentee profile pictures in progress. | ⬜ | | |
| 18 | Mentor dashboard: remove yellow, re-prioritise, show announcements compactly. | ⬜ | | |
| 19 | Task assign: drop "Assign now / Schedule once / Repeat weekly"; use two icon menus (due date, repeat) like Microsoft To Do. No reminder icon. | ⬜ | | Migration 130 already added `assigned_tasks.repeat_rule`. |
| 20 | Mentor calendar: pick a **time** on the calendar, and set repeating availability by day + time. | ⬜ | | |
| 21 | Feature-usage statistics per role (which pages/features are actually used). | ⬜ | | Open-ended programme. |
| 22 | Admins can create standing clans too. | ⬜ | | |
| 23 | Program/clan filters across the admin panel (people → mentees/mentors, enrollments, clan requests), ideally one global program selector. | ⬜ | | Open-ended programme. |
| 24 | Admin live-meeting screen redesign (calendar, Meet-like). | ⬜ | | |
| 25 | Opening a conversation must land scrolled to the newest message. | ⬜ | | |
| 26 | Workspace plan & usage shows wrong usage and wrong current plan. | ⬜ | | Production-scale numbers; see flag 4. |
| 27 | Admin Review-Lock page: remove yellow, improve accessibility, allow grant/revoke per program or clan as well as org-wide. | ⬜ | | Same feature as #14. |
| 28 | Remove unnecessary database data (~700 MB). | ⬜ | | Production data — see flag 4. |
| 29 | Admin access logs must be human-readable, with pagination and search. | ⬜ | | Currently raw `Post /api/...` rows. |
| 30 | Extract reusable components (drawers, profile pictures, …) — reduce duplication. | ⬜ | | Open-ended programme. |
| 31 | Clan review "no mentee" empty state needs to be better. | ⬜ | | |
| 32 | A standing-clan request should carry the mentor's active mentees (with their work) across automatically. | ⬜ | | |
| 33 | Blockers/plan shows "N tasks" that cannot be seen; wrong tasks; must be clan-scoped for mentor and mentee. Work-history drawer reports 0 tasks while the profile shows 24. | ⬜ | | Same family as #5. |

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
