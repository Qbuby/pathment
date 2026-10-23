import '@/styles/mentor-appearance.css';
import '@/styles/mentee-appearance.css';
import { MenteeWorkspaceTabs } from '@/components/mentee/MenteeWorkspaceTabs';
import { Navigation } from '@/components/shared/Navigation';
import { RoleGuard } from '@/components/shared/RoleGuard';
import OnboardingGuard from '@/components/shared/OnboardingGuard';
import { ActivityTrackerMount } from '@/components/shared/ActivityTrackerMount';
import { TimezoneSync } from '@/components/shared/TimezoneSync';
import { WalkthroughMount } from '@/components/onboarding/WalkthroughMount';
import { ChangelogMount } from '@/components/shared/ChangelogMount';
import { InterviewResumeBar } from '@/components/mentee/InterviewResumeBar';
import { ReviewJoinBar } from '@/components/mentee/ReviewJoinBar';
import { PausedBanner } from '@/components/mentee/PausedBanner';

export default function MenteeLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['mentee']}>
      <OnboardingGuard>
        <div data-mentee-appearance className="min-h-screen bg-canvas">
          <ActivityTrackerMount />
          <TimezoneSync />
          <WalkthroughMount role="mentee" />
          <ChangelogMount role="mentee" />
          <InterviewResumeBar />
          <Navigation role="mentee" />
          <main className="lg:pl-64 pt-14 lg:pt-0">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {/*
                * A pause is shown, not enforced.
                *
                * This used to be a gate that replaced the whole mentee side
                * with an "ask a mentor to resume you" card. Three things were
                * wrong with that. A pause belongs to one clan membership, so
                * it has no business hiding a certificate another clan awarded.
                * It read the mentor clan picker to decide which clan was in
                * effect, which is empty for a pure mentee, so the clan-scoped
                * check was in practice a global one. And submitting work is
                * itself the auto-resume trigger (submissionService), so
                * blocking the tasks page sealed off the one way back a mentee
                * could take without waiting on somebody else.
                *
                * So the strip states the pause on every page and leaves the
                * product open. Coming back is one submission away, which is
                * exactly what we want to make easy.
                */}
              <PausedBanner />
              <ReviewJoinBar />
              <MenteeWorkspaceTabs />
              {children}
            </div>
          </main>
        </div>
      </OnboardingGuard>
    </RoleGuard>
  );
}
