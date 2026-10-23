/* eslint-disable @typescript-eslint/no-explicit-any -- the clan task payload is
   untyped at its source (`useTaskDetail` returns `any`); the pool one is typed
   and is mapped onto the same shape here. */
'use client';

import { qk, useApiQuery } from '@/lib/query';
import { candidateApi, type CandidateTaskDetail } from '@/lib/services/pool-api';
import { useTaskDetail, type UseTaskDetailReturn } from './useTaskDetail';

/** Where a learner's work is read from. A round is fenced off from clan queries. */
export type MenteeTaskSource = 'clan' | 'pool';

/**
 * One piece of work, whichever scope the learner is in.
 *
 * A selection round's work cannot come from the clan endpoints - `AssignedTask`
 * carries a default scope that hides pool work from every one of them, which is
 * the fence the whole feature rests on. But that is a fetching detail, and it
 * had been allowed to decide what the SCREENS look like: the round got its own
 * thin page because the shared drawer could only read a clan task.
 *
 * So the difference stops here. The pool payload is mapped onto the shape the
 * shared drawer already reads, and both hooks are always called with only one
 * enabled, so no request is made for the scope the learner is not in.
 */
export function useMenteeTaskDetail(taskId: string, source: MenteeTaskSource = 'clan'): UseTaskDetailReturn {
  const clan = useTaskDetail(source === 'clan' ? taskId : '');
  const pool = useApiQuery<CandidateTaskDetail>({
    queryKey: qk.candidate.task(taskId),
    queryFn: () => candidateApi.task(taskId),
    enabled: source === 'pool' && !!taskId,
    errorMessage: 'Could not load this piece of work',
  });

  if (source === 'clan') return clan;
  return {
    task: pool.data ? toSharedShape(pool.data) : null,
    loading: pool.loading,
    error: pool.error ?? '',
    errorStatus: pool.errorStatus,
    refetch: pool.refetch,
  };
}

/**
 * A round's work, in the shape the shared task drawer reads.
 *
 * A clan task keeps its brief on a `roadmapTask` template; a round flattens
 * that server-side because its work can be written for the round itself. Both
 * are filled in so the drawer needs no branch of its own.
 *
 * `pointsAwarded` and the review's rating are deliberately left off: a
 * candidate is shown what their work is worth and never what they scored on
 * it, because a round is not a leaderboard to the people in it.
 */
function toSharedShape(t: CandidateTaskDetail): any {
  const template = {
    title: t.title,
    type: t.type,
    description: t.description,
    deliverable: t.deliverable,
    acceptanceCriteria: t.acceptanceCriteria,
    estimatedHours: t.estimatedHours ?? null,
    pointsBase: t.points ?? null,
    difficulty: t.difficulty ?? null,
  };
  return {
    id: t.id,
    status: t.status,
    dueDate: t.dueDate,
    title: t.title,
    type: t.type,
    description: t.description,
    resources: t.resources,
    points: t.points ?? null,
    roadmapTask: template,
    submissions: (t.submissions || []).map((s) => ({
      ...s,
      // The clan payload calls them attachments; the drawer reads that name.
      attachments: s.files,
    })),
  };
}
