# Gamification

**What it is:** the motivation layer - **points/XP**, **badges**, **challenges**,
**leaderboards**, and a **gift catalog** mentees redeem XP for.

**Why it exists:** long programs need momentum. Points and badges reward consistent progress;
leaderboards add friendly competition; gifts give XP tangible value.

## Data model
`Badge` + `UserBadge` (earned), `Challenge` + `UserChallenge` (progress), `PointsHistory`
(every XP change with source), `LeaderboardEntry` (rank/points per period), `Gift`
(costXp, stock) + `Redemption` (mentee spends XP). See [DATABASE.md §9](../DATABASE.md). Migration 021/034.

## Backend
- **`/api/gamification`:** public `GET /leaderboard`, `/badges`, `/challenges`; per-user `GET /user/:id/stats|badges|points-history`, `/challenges/user/:id`; `POST /challenges/:id/join` (mentee/mentor); admin `POST /badges` and `/badges/award` (`gamification.manage`). Workspaces start with an empty badge catalog; admins create the badges and criteria their program uses.
- **Rewards (`/api/rewards`):** `GET /` catalog + `POST /redeem` + `GET /balance/:menteeId` (mentor/admin); gift catalog management `POST/PATCH/DELETE /gifts` + `/gifts/upload` (`gamification.manage`).
- Points are awarded by `gamificationService` from task completions etc. (`AssignedTask.pointsAwarded`, `RoadmapTask.pointsBase`); badge unlocks bump counters via model hooks.

## Frontend
- **Mentee:** `/mentee/gamification` (their points, badges, challenges, level, streak).
- **Mentor:** `/mentor/leaderboard`, `/mentor/rewards` (redeem on a mentee's behalf, see balances).
- **Admin:** `/admin/rewards` (manage the gift catalog; badges/challenges via gamification.manage).

## Role flows
- **Mentee:** earns points/badges by completing tasks and maintaining streaks; joins challenges; spends XP on gifts.
- **Mentor:** views leaderboards, helps mentees redeem rewards, sees balances.
- **Admin / program_admin:** creates badges + challenges, curates the gift catalog (with images).

## Rules & edge cases
- Gifts can have finite `stock` (null = unlimited); `Redemption` snapshots the XP cost.
- Leaderboard entries are per period (`periodType` + range), visibility-controlled.
- Badge criteria are data-driven (`criteriaType` + `criteriaValue`).

## Related
[Roadmaps & Tasks](./roadmaps-and-tasks.md) (points source) · [Community](./community.md) (kudos) · [Authorization](./authorization-rbac.md) (`gamification.manage`)
