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
| 1 | Remember the selected clan (mentor **and** mentee) across navigation/return. Web + mobile. | ⬜ | | Mobile is a separate repo — see flag 4. |
| 2 | Announcements UI/UX is poor for admin, mentor and mentee — redesign. | ⬜ | | Refs: admin list + mentee "From your community" cards. |
| 3 | A mentor who also has admin access sees **every clan's** announcements even on the mentor/mentee tab — scope bug. | ⬜ | | |
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
