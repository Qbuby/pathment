/**
 * Which plan keys the product actually ENFORCES today.
 *
 * The plan rows (seeded by migration 110) carry more keys than the product
 * ships: storageGb / aiEvaluationsPerMonth are never metered, and sso /
 * customDomain are not implemented. The public pricing projection
 * (organizationService.plans) deliberately hides those; the operator console
 * shows them - operators need the whole row - but must LABEL them, or the
 * console contradicts the pricing page and reads as wrong numbers.
 *
 * Keep in sync with server: organizationService.plans() projection +
 * assertLimit()/entitlement() enforcement.
 */
export const ENFORCED_LIMITS = new Set(['members', 'programs', 'clans']);

export const SHIPPED_FEATURES = new Set([
  'certificates',
  'aiEvaluation',
  'advancedAnalytics',
  'programCompletionStanding',
  // Enforced for workspace logo/brand-color editing, though not advertised publicly.
  'customBranding',
]);

export const isEnforcedLimit = (key: string): boolean => ENFORCED_LIMITS.has(key);
export const isShippedFeature = (key: string): boolean => SHIPPED_FEATURES.has(key);

/** Muted chip for a key that exists on the plan row but changes nothing yet. */
export const NOT_ENFORCED_HINT = 'Seeded on the plan row but not enforced by the product yet — the pricing page does not advertise it.';
