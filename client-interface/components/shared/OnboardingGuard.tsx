'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { Loader2 } from 'lucide-react';
import { workspacePath } from '@/lib/services/workspace-scope';

/** A profile photo is mandatory for these roles (admins are exempt). */
const PHOTO_REQUIRED_ROLES = ['mentor', 'mentee'];

export default function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading, availableRoles } = useAuth();

  /**
   * A selection-pool candidate is not onboarded as a learner.
   *
   * The learner flow asks for skills, goals and a weekly time commitment —
   * all of it about a roadmap and a mentor they do not have yet, and all of it
   * created when they are placed. Walking them through it before the round is
   * decided asks for answers nothing will read, and it would sit between them
   * and the qualifying work that is actually due.
   */
  const poolOnly = !!user
    && Boolean(user.capabilities?.includes('candidate'))
    && !availableRoles.includes('mentee');

  const needsOnboarding = !!user && !poolOnly && !user.profileCompleted && user.onboardingStep !== 2;
  // Onboarding is otherwise done, but the user still owes us a profile photo.
  // This also catches EXISTING users (profileCompleted) the next time they log in.
  const needsPhoto = !!user && !poolOnly && user.profileCompleted
    && PHOTO_REQUIRED_ROLES.includes(user.role) && !user.profilePictureUrl;

  useEffect(() => {
    if (isLoading || !user || poolOnly) return;

    if (!user.profileCompleted) {
      const step = user.onboardingStep || 0;
      if (step === 0) {
        router.push(workspacePath(user.role === 'mentor' ? '/onboarding/mentor' : '/onboarding/mentee'));
      } else if (step === 1) {
        router.push(workspacePath('/onboarding/skills'));
      }
      return;
    }

    if (needsPhoto) router.push(workspacePath('/onboarding/photo'));
  }, [user, isLoading, router, needsPhoto, poolOnly]);

  // Hold the dashboard back while we redirect to onboarding / the photo step.
  if (isLoading || needsOnboarding || needsPhoto) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return <>{children}</>;
}
