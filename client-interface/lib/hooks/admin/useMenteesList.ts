'use client';

import { useState, useEffect } from 'react';
import { qk, useApiQuery } from '@/lib/query';
import { menteeApi } from '@/lib/services/mentee-api';
import { usePagination } from '@/lib/hooks/shared/usePagination';
import { useDebounce } from '@/lib/hooks/shared/useDebounce';
import { useAdminScope } from '@/lib/context/AdminScopeContext';

export interface MenteeListItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  createdAt: string;
  profilePictureUrl?: string | null;
  /** The mentee's current clan placement (for the "move clan" action). */
  currentClan?: { id: string; name: string; programId: string } | null;
  menteeProfile?: {
    currentEducation?: string;
    currentOccupation?: string;
    totalProgramsEnrolled?: number;
    totalProgramsCompleted?: number;
    totalTasksCompleted?: number;
    totalPoints?: number;
    currentLevel?: number;
    currentStreakDays?: number;
    lastActivityDate?: string;
    totalBadgesEarned?: number;
  };
}

interface UseMenteesListReturn {
  mentees: MenteeListItem[];
  isLoading: boolean;
  error: string | null;
  pagination: ReturnType<typeof usePagination>;
  search: string;
  setSearch: (v: string) => void;
  refetch: () => Promise<void>;
}

interface MenteePage { mentees: MenteeListItem[]; total?: number }

const NO_MENTEES: MenteeListItem[] = [];

export function useMenteesList(): UseMenteesListReturn {
  const pagination = usePagination({ initialPage: 1, initialLimit: 20 });
  const [search, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  // The programme/clan chosen in the admin scope picker. Empty object when
  // nothing is chosen, so the request is byte-for-byte what it always was.
  const { query: scope } = useAdminScope();
  const scopeKey = `${scope.programId || ''}:${scope.clanId || ''}`;

  const { data, loading, error, refetch } = useApiQuery<MenteePage>({
    queryKey: [...qk.admin.menteeList(pagination.page, pagination.limit, debouncedSearch.trim()), scopeKey],
    queryFn: async () => {
      const response = await menteeApi.getAll({
        ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
        ...scope,
        page: pagination.page,
        limit: pagination.limit,
      });
      return { mentees: response?.data?.mentees ?? [], total: response?.pagination?.totalItems };
    },
    errorMessage: 'Failed to load mentees',
  });

  const total = data?.total;
  useEffect(() => {
    if (total !== undefined) pagination.setTotal(total);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  // Reset to page 1 when the search OR the scope changes — page 4 of the old
  // filter is rarely page 4 of the new one.
  useEffect(() => {
    pagination.reset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, scopeKey]);

  return {
    mentees: data?.mentees ?? NO_MENTEES,
    isLoading: loading,
    error,
    pagination,
    search,
    setSearch: setSearchInput,
    refetch,
  };
}
