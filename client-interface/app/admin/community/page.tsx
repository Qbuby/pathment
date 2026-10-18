'use client';

import CommunityHub from '@/components/community/CommunityHub';

/**
 * The same community an admin's people are in.
 *
 * Admins had Announcements, Live meetings and Moderation but no way to read
 * the conversation they moderate — so the only view of a report was the
 * report. Spaces are resolved from this account's own memberships and
 * enrolments exactly as they are for a mentor or a mentee, and `isAdmin`
 * already makes them a moderator in every space they can see.
 */
export default function AdminCommunity() {
  return <CommunityHub />;
}
