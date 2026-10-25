import { apiClient } from './api-client';

export interface TalkCategory {
  id: string;
  name: string;
  talkCount?: number;
}

export interface TalkReview {
  id: string;
  rating: number;
  feedback?: string | null;
  user?: {
    id: string;
    firstName?: string;
    lastName?: string;
    name?: string;
  } | null;
  createdAt: string;
}

export interface TalkItem {
  id: string;
  title: string;
  speaker: string | null;
  description: string | null;
  url: string;
  thumbnailUrl: string | null;
  durationMins: number | null;
  rating: number;
  ratingsCount: number;
  uploadedBy: string | null;
  uploaderName: string | null;
  categories: { id: string; name: string }[];
  canManage: boolean;
  createdAt: string;
}

export interface TalkInput {
  title: string;
  speaker?: string;
  description?: string;
  url: string;
  thumbnailUrl?: string | null;
  durationMins?: number | null;
  categoryIds: string[];
}

export interface TalksListParams {
  search?: string;
  categoryId?: string;
  limit?: number;
  offset?: number;
}

export interface ResolveUrlResult {
  url: string;
  exists: boolean;
  existingTalk?: {
    id: string;
    title: string;
    speaker?: string | null;
    url: string;
    thumbnailUrl?: string | null;
    durationMins?: number | null;
  } | null;
  metadata: {
    title?: string | null;
    speaker?: string | null;
    thumbnailUrl?: string | null;
    description?: string | null;
    durationMins?: number | null;
  };
}

export const talksApi = {
  list: (params?: TalksListParams) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.categoryId) qs.set('categoryId', params.categoryId);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const query = qs.toString();
    return apiClient.get(query ? `/talks?${query}` : '/talks');
  },
  get: (id: string) => apiClient.get(`/talks/${id}`),
  resolveUrl: (url: string) =>
    apiClient
      .get<{ success?: boolean; data?: ResolveUrlResult } & ResolveUrlResult>(`/talks/resolve-url?url=${encodeURIComponent(url)}`)
      .then((res) => ((res.data?.metadata || res.data?.exists !== undefined ? res.data : res) as ResolveUrlResult)),
  create: (data: TalkInput) => apiClient.post('/talks', data),
  update: (id: string, data: Partial<TalkInput>) => apiClient.patch(`/talks/${id}`, data),
  remove: (id: string) => apiClient.delete(`/talks/${id}`),

  getReviews: (talkId: string) => apiClient.get<{ reviews: TalkReview[] }>(`/talks/${talkId}/reviews`),
  addReview: (talkId: string, data: { rating: number; feedback?: string }) =>
    apiClient.post<{ talk: TalkItem; review: TalkReview }>(`/talks/${talkId}/reviews`, data),

  listCategories: () => apiClient.get('/talks/categories'),
  createCategory: (name: string) => apiClient.post('/talks/categories', { name }),
  updateCategory: (id: string, name: string) => apiClient.patch(`/talks/categories/${id}`, { name }),
  removeCategory: (id: string) => apiClient.delete(`/talks/categories/${id}`),
};
