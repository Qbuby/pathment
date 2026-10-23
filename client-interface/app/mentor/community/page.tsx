'use client';

import CommunityHub from '@/components/community/CommunityHub';

export default function MentorCommunity() {
  // No role prop: the hub is the same screen for everybody, and which spaces
  // it shows comes from the server off this person's memberships.
  return <CommunityHub />;
}
