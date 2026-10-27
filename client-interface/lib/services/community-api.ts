import { apiClient } from './api-client';

export type ScopeType = 'clan' | 'cohort' | 'program' | 'global';
export type PostType = 'kudos' | 'win' | 'question' | 'discussion' | 'resource' | 'meme' | 'standup';
export type ReactionType = 'cheers' | 'celebrate' | 'helpful' | 'insightful';

export interface CreatePostInput {
  type: PostType;
  scopeType: ScopeType;
  scopeId?: string | null;
  title?: string;
  body: string;
  toId?: string;
  tags?: string[];
  linkUrl?: string;
  mentionedUserIds?: string[];
  attachments?: { url?: string; name?: string; kind?: string }[];
}

export interface FeedQuery {
  scopeType: ScopeType;
  scopeId?: string | null;
  type?: PostType | null;
  tag?: string | null;
  q?: string | null;
}

const params = (q: Record<string, unknown>) => {
  const out: Record<string, string> = {};
  Object.entries(q).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') out[k] = String(v); });
  return out;
};

/** Community v2 - scoped spaces, posts, threads, Q&A, moderation. */
/** Why a member is reporting something. Keep in step with the server's list. */
export type ReportCategory = 'spam' | 'scam' | 'hate' | 'violence' | 'other';

export const REPORT_CATEGORIES: { value: ReportCategory; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'scam', label: 'Scam or fraud' },
  { value: 'hate', label: 'Hateful content' },
  { value: 'violence', label: 'Violence or threats' },
  { value: 'other', label: 'Something else' },
];
/** The one reason that says nothing on its own, so the details become mandatory. */
export const REPORT_DETAILS_REQUIRED_FOR: ReportCategory = 'other';
export const REPORT_DETAILS_MAX = 1000;

export const communityApi = {
  // spaces & people
  spaces: () => apiClient.get('/community/spaces'),
  members: (
    scopeType: ScopeType,
    scopeId?: string | null,
    opts: { limit?: number; offset?: number; q?: string | null } = {},
  ) =>
    apiClient.get('/community/members', {
      params: params({ scopeType, scopeId, limit: opts.limit, offset: opts.offset, q: opts.q }),
    }),
  people: (scopeType: ScopeType, scopeId?: string | null) =>
    apiClient.get('/community/people', { params: params({ scopeType, scopeId }) }),
  leaderboard: (scopeType: ScopeType, scopeId?: string | null, period: 'week' | 'all' = 'all') =>
    apiClient.get('/community/leaderboard', { params: params({ scopeType, scopeId, period }) }),

  // feed
  feed: (q: FeedQuery) => apiClient.get('/community/feed', { params: params({ ...q }) }),

  // attachments → returns { attachments: [{ url, name, kind }] }
  upload: (files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    return apiClient.post('/community/upload', fd);
  },

  // posts
  createPost: (data: CreatePostInput) => apiClient.post('/community/posts', data),
  updatePost: (id: string, data: Partial<Pick<CreatePostInput, 'body' | 'title' | 'tags' | 'linkUrl'>>) =>
    apiClient.patch(`/community/posts/${id}`, data),
  deletePost: (id: string) => apiClient.delete(`/community/posts/${id}`),
  pin: (id: string, pinned: boolean) => apiClient.post(`/community/posts/${id}/pin`, { pinned }),
  react: (id: string, type: ReactionType) => apiClient.post(`/community/posts/${id}/react`, { type }),

  // comments / threads
  comments: (postId: string) => apiClient.get(`/community/posts/${postId}/comments`),
  addComment: (postId: string, data: { body: string; parentId?: string; mentionedUserIds?: string[] }) =>
    apiClient.post(`/community/posts/${postId}/comments`, data),
  acceptAnswer: (postId: string, commentId: string) =>
    apiClient.post(`/community/posts/${postId}/accept`, { commentId }),
  updateComment: (id: string, body: string) => apiClient.patch(`/community/comments/${id}`, { body }),
  deleteComment: (id: string) => apiClient.delete(`/community/comments/${id}`),

  // moderation
  report: (data: { targetType: 'post' | 'comment'; targetId: string; category: ReportCategory; details?: string }) =>
    apiClient.post('/community/reports', data),
  reports: (status = 'open') => apiClient.get('/community/reports', { params: params({ status }) }),
  resolveReport: (id: string, status: 'reviewed' | 'dismissed') =>
    apiClient.patch(`/community/reports/${id}`, { status }),
};
