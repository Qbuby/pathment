import { apiClient } from './api-client';

// Mirrors APP_TYPES in server/src/config/externalApps.js.
export type ExternalAppType = 'course' | 'communication' | 'productivity' | 'developer' | 'analytics' | 'other';

/** A catalog app as one workspace sees it. */
export interface ExternalApp {
  id: string;
  name: string;
  type: ExternalAppType;
  description: string | null;
  iconUrl: string | null;
  connected: boolean;
  connectedAt: string | null;
}

export interface ExternalAppInput {
  name: string;
  type: ExternalAppType;
  description?: string | null;
  iconUrl?: string | null;
  isActive?: boolean;
}

export const appsApi = {
  list: (params?: { search?: string; type?: ExternalAppType }) => apiClient.get('/apps', { params }),
  connect: (id: string) => apiClient.post(`/apps/${id}/connect`),
  disconnect: (id: string) => apiClient.delete(`/apps/${id}/connect`),

  // Catalog authoring — platform admins only.
  listCatalog: (params?: { search?: string; type?: ExternalAppType }) => apiClient.get('/apps/catalog', { params }),
  create: (data: ExternalAppInput) => apiClient.post('/apps/catalog', data),
  update: (id: string, data: Partial<ExternalAppInput>) => apiClient.patch(`/apps/catalog/${id}`, data),
  remove: (id: string) => apiClient.delete(`/apps/catalog/${id}`),
};
