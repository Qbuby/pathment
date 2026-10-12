import { apiClient } from './api-client';

// Mirrors APP_TYPES in server/src/config/externalApps.js.
export type ExternalAppType = 'course' | 'communication' | 'productivity' | 'developer' | 'analytics' | 'other';

/** One key the connect dialog asks for (declared by the server-side integration). */
export interface AppCredentialField {
  key: string;
  label: string;
  secret: boolean;
}

/** A catalog app as one workspace sees it. */
export interface ExternalApp {
  id: string;
  name: string;
  type: ExternalAppType;
  description: string | null;
  iconUrl: string | null;
  /** False = listed, but there is no integration to connect yet. */
  connectable: boolean;
  credentialFields: AppCredentialField[];
  connected: boolean;
  /** 'error' = the provider has since rejected the stored keys. */
  status: 'connected' | 'error' | null;
  credentialsMasked: string | null;
  /** The provider's name for this workspace's account. */
  accountName: string | null;
  connectedAt: string | null;
  lastVerifiedAt: string | null;
}

export interface ExternalAppInput {
  name: string;
  type: ExternalAppType;
  description?: string | null;
  iconUrl?: string | null;
  integrationKey?: string | null;
  isActive?: boolean;
}

export const appsApi = {
  list: (params?: { search?: string; type?: ExternalAppType }) => apiClient.get('/apps', { params }),
  /** The server verifies the keys with the provider before storing them. */
  connect: (id: string, credentials: Record<string, string>) => apiClient.post(`/apps/${id}/connect`, { credentials }),
  test: (id: string) => apiClient.post(`/apps/${id}/test`),
  disconnect: (id: string) => apiClient.delete(`/apps/${id}/connect`),

  // Catalog authoring — platform admins only.
  listCatalog: (params?: { search?: string; type?: ExternalAppType }) => apiClient.get('/apps/catalog', { params }),
  create: (data: ExternalAppInput) => apiClient.post('/apps/catalog', data),
  update: (id: string, data: Partial<ExternalAppInput>) => apiClient.patch(`/apps/catalog/${id}`, data),
  remove: (id: string) => apiClient.delete(`/apps/catalog/${id}`),
};
