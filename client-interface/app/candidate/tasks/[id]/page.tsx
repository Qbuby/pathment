import { CandidateRedirect } from '../../CandidateRedirect';

/** `?pool=1` is how the learner task screen knows this is qualifying work. */
export default async function CandidateTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CandidateRedirect to={`/mentee/tasks/${id}?pool=1`} />;
}
