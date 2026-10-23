# Releasing to production (staging → main)

How we ship a release to prod. This is the repeatable checklist — follow it every
time. For first-time server/infra setup see `DEPLOY.md`; for the day-to-day deploy
commands see its "Day-2 operations" section.

---

## The one thing to understand first

The two environments handle the **database schema completely differently**:

Both are Heroku container apps (`pathment-staging`, `pathment-api`) with their own
Postgres, and **both get schema changes the same way: migrations, run by hand.**

| | How schema changes reach it | Deploy |
|---|---|---|
| **Staging** | **Migrations only.** `heroku run node scripts/migrate.js -a pathment-staging` | `git push staging-heroku staging:main` (or Deploy in the dashboard) |
| **Production** | **Migrations only.** `heroku run node scripts/migrate.js -a pathment-api` | `git push production-heroku main:main` |

> This page used to claim `db:sync` ran on every staging deploy, so staging needed no
> migrations. It does not, and has not for some time: the boot-time sync in
> `src/index.js` is commented out, and `syncDatabase.js` refuses outright when `DYNO`
> is set. Believing the old note is how staging came to sit two migrations behind its
> own models while reading as if it were up to date. **If a model changed, staging
> needs the migration too** — it is not a schema that heals itself.

**The trap, either way:** a feature works locally because `db:sync` silently added the
column. On a deployed environment that column does **not** exist until you write and
run a migration. If the new code deploys before the migration runs, Sequelize
`SELECT`s a missing column and those endpoints 500. **Every model change needs a
matching migration.** Run it BEFORE the code that needs it — additive nullable columns
are invisible to the old code still serving, so there is no broken window.

Before deploying either one, check the build will install: CI runs `npm ci` in
`server/`, and the Dockerfile runs it again on `node:20`'s npm. A lock file relocked
by a newer npm can pass locally and fail the build.

---

## 1. Before you promote — preflight

Run these from the repo root while on `staging`:

```bash
git fetch origin
# (a) Confirm staging is a clean fast-forward ahead of main:
git merge-base --is-ancestor origin/main origin/staging && echo "FF OK" || echo "DIVERGED — stop, ask for help"

# (b) THE IMPORTANT ONE — did any model change without a migration?
echo "Models changed since main:"
git diff --name-only origin/main origin/staging -- server/src/models/
echo "Migrations added since main:"
git diff --name-status origin/main origin/staging -- server/scripts/migrations/
```

If a model under `server/src/models/` changed (new column, new table, type change) and
there is **no** corresponding new migration in `server/scripts/migrations/`, **write the
migration before promoting.** Model up to date on staging via db:sync ≠ prod is ready.

Also sanity-check:
- [ ] Migrations are **additive / backward-compatible** (add nullable columns; don't drop
      or rename a column the still-running old code reads — see "Expand → contract" below).
- [ ] No secrets added to the repo (it's public).
- [ ] You're OK with prod redeploying: pushing `main` triggers it immediately.

---

## 2. Promote staging → main

```bash
cd /media/sheryar-ahmed/01DC5351630C77508/industry/os/pathment
git fetch origin
git checkout main
git reset --hard origin/main          # local main = remote
git merge --ff-only origin/staging    # clean fast-forward, no merge commit
git push origin main
git checkout staging                  # back to the working branch
```

`--ff-only` refuses anything that isn't a clean fast-forward. If it errors, **stop** —
the branches have diverged and need a closer look, not a force.

**Pushing `main` deploys nothing.** There is no deploy workflow — `.github/workflows/`
holds `ci.yml` and nothing else. Prod is a Heroku **container** app built from the root
`Dockerfile`, and it ships when you say so:

```bash
git push production-heroku main:main   # or Heroku dashboard → Deploy branch
heroku releases -a pathment-api -n 3   # confirm "Deploy <sha>" is your sha
```

`git push origin main` is still worth doing first, so the deployed sha exists on the
remote and `main` records what production is running.

---

## 3. Run the release's migrations on prod

```bash
heroku run node scripts/migrate.js --status -a pathment-api   # what's pending
heroku run node scripts/migrate.js -a pathment-api            # apply all of it
```

`migrate.js` records what it ran in `schema_migrations`, so it is safe on every deploy
and only ever applies what is new. Destructive `*drop*` migrations are **skipped** —
pass `--include-drops` only when you mean it. A single migration, or a rollback where
one is supported:

```bash
heroku run node scripts/migrations/<NNN>_<name>.js -a pathment-api
heroku run node scripts/migrations/<NNN>_<name>.js --rollback -a pathment-api
```

### The gotcha: `heroku run` runs the DEPLOYED code
A one-off dyno gets the current slug, so **a migration that isn't deployed yet does not
exist to run.** That rules out the obvious "migrate first, deploy second" ordering, and
it is quietly dangerous: `migrate.js` on the old slug reports "schema is up to date"
while the new release's migrations sit in your working copy, unlisted and unrun. Two
ways round it, in order of preference:

```bash
# (a) additive migrations — run them from your checkout BEFORE deploying, so the new
#     columns exist before the code that reads them. Nullable additions are invisible
#     to the old code still serving, so there is no broken window.
cd server
DATABASE_URL="$(heroku config:get DATABASE_URL -a pathment-api)" \
  node scripts/migrations/<NNN>_*.js --dry-run     # read it first, every time
DATABASE_URL="$(heroku config:get DATABASE_URL -a pathment-api)" \
  node scripts/migrations/<NNN>_*.js
# scripts/migrations/_db.js is SSL-aware, which is why this works against Heroku PG.
# Then deploy, then record the run so a later migrate.js agrees with reality:
heroku pg:psql -a pathment-api \
  -c "insert into schema_migrations (name) values ('<NNN>_<name>.js') on conflict do nothing"

# (b) deploy, then migrate immediately. Simpler, but the endpoints that read the new
#     column 500 for the seconds in between.
```

> Don't use (a) for **destructive** migrations (drop/rename) — those must go in a
> *later* release after no code references the old shape (see Expand → contract).

**Take a backup before anything that writes:** `heroku pg:backups:capture -a pathment-api`.

### A database that has never seen migrate.js
If `schema_migrations` doesn't exist, the schema was built by `db:sync` from the models.
Do **not** try to replay history — seven early migrations have no exported `up()` and
`migrate.js` throws on the first one it meets. Baseline instead, after checking the
schema really is current (diff `information_schema.columns` against a database you know
is fully migrated):

```bash
heroku run node scripts/migrate.js --baseline -a <app>   # record as applied, change nothing
```

---

## 4. Verify

```bash
heroku ps -a pathment-api                          # web.1 up
heroku logs -a pathment-api -n 50                  # no boot errors / no "column does not exist"
curl -s https://<API_DOMAIN>/api/health            # 200
```

Then in the app: hit the feature that shipped (e.g. assign a task with an override),
and skim `/admin/emails` if the release touched mail.

---

## 5. If something's wrong — roll back

Code rollback — Heroku keeps the previous slug, so this needs no rebuild:

```bash
heroku releases -a pathment-api -n 5    # find the last good "Deploy <sha>"
heroku rollback vNNN -a pathment-api
```

Then, if the bad release ran a migration and the previous code can't tolerate the new
schema, roll the migration back too (`--rollback`). Additive nullable columns usually
need no rollback — old code just ignores them.

To find the previous good sha: `git log --oneline origin/main`.

---

## Expand → contract (how to change schema without an outage)

Never drop/rename a column in the same release that stops using it — during the deploy,
old and new code briefly overlap.

1. **Expand** — release A: add the new (nullable) column + write code that handles both
   old and new shapes. Migration is additive only.
2. **Migrate data** if needed (backfill), still tolerant of both shapes.
3. **Contract** — release B (later, once all running code uses the new shape): drop the
   old column.

---

## Known caveat: brief deploy downtime

A deploy builds the image, then cycles the single web dyno, so there is a short window
— roughly the cold boot — where requests can fail. With one dyno there is nothing to
roll onto. We've chosen to live with it. The fix (a second dyno so Heroku can cycle
them in turn, plus graceful shutdown) is understood but deferred — pick it up when
deploy frequency makes the window worth paying for.

---

## Standing rules (project)

- Work on `staging`; `main` is prod. Never push straight to `main` without going through
  this checklist.
- **Never** run `db:sync` / `sequelize.sync({alter})` / reset against the **prod** DB —
  it has ~3,000 real users. Schema changes go through migrations only.
- The repo is **public** — no secrets in code or commits.
