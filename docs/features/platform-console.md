# Platform console (operator surface)

**What it is:** the Pathment OPERATOR surface at `/platform` — cross-workspace by
nature, deliberately unreachable through any workspace role. A tenant
`super_admin` is the most powerful role *inside one organization*; the platform
console is who runs Pathment itself: provisioning customer workspaces, choosing
and assigning plans, carrying custom arrangements, activating invoices, and
account-level support.

## Identity & tiers

`platform_admins` (migration 134) holds one row per operator. Tiers map to
gates in `middlewares/platformAdmin.js`:

| Tier | Gates |
| --- | --- |
| `owner` | read, support, billing, lifecycle, owner |
| `billing` | read, billing (plans, overrides, provisioning, subscriptions) |
| `support` | read, support (activation links, account actions, lead triage) |
| `readonly` | read |

`PLATFORM_ADMIN_EMAILS` (comma-separated) remains the BOOTSTRAP owner list so a
fresh or locked-out deployment can always reach the console; grant real rows
from `/platform/admins` or `node scripts/seedPlatformAdmin.js --email … --role owner`.
Revoking keeps the row (`revoked_at`) so grant history survives. Nobody can
edit or revoke themselves.

## The tenant boundary, crossed on purpose

`organizationContext` skips `/api/platform` entirely: operator requests run
with NO workspace in context, so with `MULTI_TENANT_WORKSPACES_ENABLED` any
query that forgot explicit handling throws instead of silently widening.
Cross-workspace reads live in `platformOrganizationService` and pass
`skipOrganizationScope` explicitly; anything concerning ONE workspace re-enters
that workspace's request context (`inOrganization`) and reuses the existing
tenant-scoped services.

## Audit

`platform_audit_logs` is append-only (updates/deletes throw at the model
boundary) and separate from `audit_logs`, whose `organization_id` is NOT NULL —
platform actions often have no tenant. Entries carry actor, target, old/new
values, the operator's written reason verbatim, ip/ua. Billing-grade actions
pass a transaction so the evidence commits with the act. Explorable at
`/platform/audit`.

## Provisioning & owner activation

`platformProvisioningService.provision` creates workspace + CHOSEN plan
(any active plan, monthly/annual, optional trial) + owner atomically, inside
the new workspace's own context. Credentials follow the sign-in-link pattern:

- new account → unusable random password, `emailVerified=false`, membership
  `invited`, and a single-use 72h activation link (SHA-256 stored) emailed.
  `/activate` validates the token, the owner sets their OWN password (this
  verifies the inbox and activates the membership), then signs in normally —
  no session is ever minted by the activation endpoint, so 2FA/session rules
  stay untouched. No password ever travels by email.
- existing account → attached as owner, told where the workspace lives.

Resend spends outstanding links first (at most one live link per owner);
revoke closes the window. Both support-gated, audited. Public endpoints are
rate-limited (`platformActivationLimiter`).

## Billing

Two deliberately distinct paths:

- **Invoice activation** (`/platform/billing`) reuses
  `manualBillingService.activateRequestedPlan` unchanged — it still refuses a
  plan the workspace never requested, and the invoice reference stays the
  idempotency key. The CLI (`scripts/manageManualBilling.js`) keeps working.
- **Operator assignment** (`POST /platform/organizations/:id/plan`) needs no
  request but demands a reason, pre-flights downgrades against real usage
  (409 until `acknowledgeOverLimit`), clears pending requests, prunes
  overrides the new plan makes redundant, and audits as
  `PLATFORM_PLAN_ASSIGNED`.

**Overrides** (`PUT …/overrides`): per-workspace limits (-1 unlimited, null
clears) and feature flags layered over the plan, validated against the
vocabulary the plan catalog publishes, pruned when redundant, carrying
who/why/when in `overrides.meta`. `/platform/overrides` reports every
workspace on a custom arrangement. **Plan catalog** authoring is owner-gated;
the marketing pricing page reads it live, and the editor says so.

## Lifecycle, support, ops

- Workspace status transitions (trial/active/suspended/archived) with
  mandatory reason; suspend/archive disconnects the workspace's live sockets.
- Account-level support (`/platform/users`): the actions workspace admins are
  403'd from by design — force sign-out everywhere, 2FA reset, email
  unsuppression, account suspension (owner-gated; refuses self and platform
  admins).
- Leads (`/platform/leads`): public rate-limited intake matching
  `pathment-marketing/lib/buyer-lead.ts` (honeypots accepted-and-dropped),
  pipeline statuses, one-click provision-from-lead prefill.
- Ops (`/platform/ops`): email/AI queue depths, dead-letter retry, scheduled
  job toggles (owner), rollout gates and worker kill switches read-only.
- App catalog (`/platform/apps`): CRUD over the global external-app catalog
  that every workspace's admins see on their Apps page (read tier lists;
  owner writes, all audited). Rows carry a cross-workspace connection count —
  the blast radius of deactivating or deleting (delete cascades connections).
  An app may claim one server-side integration key (`config/externalApps.js`,
  e.g. `buildment`); keyless apps are listed but not connectable. The older
  `/api/apps/catalog` routes remain for compatibility, but the console uses
  `/api/platform/apps`, which skips workspace context like the rest of the
  console surface.

## Running it

```bash
node server/scripts/migrations/134_platform_console.js   # idempotent
node server/scripts/seedPlatformAdmin.js --email you@pathment.me --role owner
```

Console: `https://app.pathment.me/platform` (account-level path; the routing
proxy never canonicalizes `/platform` or `/activate` into `/w/<slug>/…`).

Tests: `npx jest tests/platform/platform-console.test.js` (17 cases: gating,
provisioning, activation, overrides, assignment pre-flight, lifecycle, admin
management, leads, account support).

## Deliberately NOT here (yet)

Hard delete / GDPR export (archive only), impersonation / view-as (needs a
consent + banner design), dunning automation (`past_due` is manual), domain
CRUD (rows are read-only in the detail view), and the marketing repo still
needs its `/api/buyer-interest` route pointed at `POST /api/platform/leads`.

## Related

[Authorization — scoped RBAC](./authorization-rbac.md) (workspace-side; the
console is orthogonal to it) · `docs/WORKSPACE_PATH_ROLLOUT.md` ·
`docs/ADMIN_WORKSPACE_USER_LIFECYCLE.md` (why account actions 403 for
workspace admins) · `PLANS-RELEASE-REVIEW.md` in pathment-marketing (the
operator-assisted provisioning this implements).
