import NotificationsPage from '@/components/shared/notifications/NotificationsPage';

// Candidate notifications are addressed to 'any' audience (a candidate is in
// none of the three portals), so the mentee-scoped list shows them.
export default function CandidateNotificationsPage() {
  return <NotificationsPage role="mentee" />;
}
