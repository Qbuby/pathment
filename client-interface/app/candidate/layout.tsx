import '@/styles/mentor-appearance.css';
import '@/styles/mentee-appearance.css';
import { CandidateShell } from './CandidateShell';

/**
 * The candidate area — for people in a selection pool who are not in a clan
 * yet. Same look as the mentee portal (it loads the same appearance styles),
 * but only their qualifying work, notifications and outcome.
 */
export default function CandidateLayout({ children }: { children: React.ReactNode }) {
  return <CandidateShell>{children}</CandidateShell>;
}
