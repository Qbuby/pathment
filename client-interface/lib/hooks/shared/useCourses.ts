'use client';

import { qk, STALE, useApiQuery } from '@/lib/query';
import { coursesApi, type Course, type CourseEnrollment, type CourseStatus } from '@/lib/services/courses-api';

const DISCONNECTED: CourseStatus = { connected: false, provider: 'buildment', organizationName: null, appUrl: null };

/**
 * Whether this workspace has a working course-provider connection. Every
 * course surface (the Courses tab, the Course task type) hangs off this, so a
 * failed request reads as "not connected" rather than as an error.
 */
export function useCoursesStatus(enabled = true) {
  const { data, loading } = useApiQuery<CourseStatus>({
    queryKey: qk.courses.status,
    queryFn: async () => {
      try {
        const res: any = await coursesApi.status(); // eslint-disable-line @typescript-eslint/no-explicit-any
        return res?.data ?? DISCONNECTED;
      } catch { return DISCONNECTED; }
    },
    enabled,
    staleTime: STALE.long,
  });
  return { status: data ?? DISCONNECTED, connected: data?.connected === true, loading };
}

/** Courses this workspace may assign, read live from the provider. */
export function useCourses(enabled = true) {
  const { data, loading, fetching, error, refetch } = useApiQuery<Course[]>({
    queryKey: qk.courses.list,
    queryFn: async () => {
      const res: any = await coursesApi.list(); // eslint-disable-line @typescript-eslint/no-explicit-any
      return res?.data?.courses ?? [];
    },
    enabled,
    errorMessage: 'Could not load courses',
  });
  return { courses: data ?? [], loading, fetching, error, refetch };
}

/** One course task's enrollment + progress snapshot. */
export function useCourseEnrollment(taskId: string | null | undefined) {
  const { data, loading, fetching, error, refetch } = useApiQuery<CourseEnrollment | null>({
    queryKey: qk.courses.enrollment(taskId || ''),
    queryFn: async () => {
      const res: any = await coursesApi.getForTask(taskId as string); // eslint-disable-line @typescript-eslint/no-explicit-any
      return res?.data?.enrollment ?? null;
    },
    enabled: !!taskId,
    staleTime: STALE.short,
    errorMessage: 'Could not load the course',
  });
  return { enrollment: data ?? null, loading, fetching, error, refetch };
}
