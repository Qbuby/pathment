import { CandidateRedirect } from '../../CandidateRedirect';

export default async function CandidateInterviewPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return <CandidateRedirect to={`/mentee/interviews/${taskId}`} />;
}
