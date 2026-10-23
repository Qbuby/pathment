import { CandidateRedirect } from '../../CandidateRedirect';

export default async function CandidateQuizPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return <CandidateRedirect to={`/mentee/quizzes/${taskId}`} />;
}
