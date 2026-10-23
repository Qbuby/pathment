import { redirect } from 'next/navigation';

/**
 * Review records moved into Insights → Overview, where the org's review
 * history sits beside the org's health summary instead of a tab away.
 *
 * The route stays as a redirect rather than a 404: it has been linked from
 * the admin nav for months, and somebody's bookmark should land on the thing
 * it used to show.
 */
export default function AdminReviewRecordsMoved() {
  redirect('/admin/insights?tab=records');
}
