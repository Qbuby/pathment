import axiosInstance from './axios-instance';

// export interface Session {
//   id: string;
//   ipAddress: string;
//   deviceType: string;
//   userAgent: string;
//   createdAt: string;
//   lastActivityAt: string;
//   isActive: boolean;
// }

export interface AuditLog {
  id: string;
  action: string;
  /** Friendly label, e.g. "Invite sent". */
  label?: string;
  /** Human one-line summary of what happened, e.g. "Invited mentee@x.com as mentee". */
  summary?: string | null;
  /** Friendly entity type fallback when there's no summary. */
  target?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Friendly device, e.g. "Chrome on Mac". */
  device?: string | null;
  /** Background activity (heartbeats, read receipts) rather than a deliberate act. */
  noise?: boolean;
  /** HTTP status, where the row came from a request. */
  status?: number | null;
  /** The request did not succeed — worth seeing at a glance. */
  failed?: boolean;
  createdAt: string;
}

export interface AuditLogsResponse {
  total: number;
  logs: AuditLog[];
}

export interface Setup2FAResponse {
  secret: string;
  qrCode: string;
  manualEntryKey: string;
}

export interface Verify2FAResponse {
  success: boolean;
  backupCodes: string[];
  message: string;
}

export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: string | null;
  remainingBackupCodes: number;
}

class SecurityService {
  /**
   * Get active sessions for current user
   */
  // async getActiveSessions(): Promise<Session[]> {
  //   const response = await axiosInstance.get<{ data: Session[] }>('/auth/sessions');
  //   return response.data.data || [];
  // }

  /**
   * Revoke a specific session
   */
  // async revokeSession(sessionId: string): Promise<void> {
  //   await axiosInstance.delete(`/auth/sessions/${sessionId}`);
  // }

  /**
   * Revoke all other sessions
   */
  // async revokeAllOtherSessions(): Promise<void> {
  //   await axiosInstance.post('/auth/sessions/revoke-all-others', {});
  // }

  /**
   * Get audit logs for current user
   */
  /**
   * `includeNoise` brings back session heartbeats, read receipts and token
   * refreshes. They are always recorded — an audit trail with holes is not
   * one — but they outnumber real actions by enough to drown the screen, so
   * they are off unless asked for.
   */
  async getAuditLogs(
    limit: number = 50,
    offset: number = 0,
    opts: { search?: string; includeNoise?: boolean } = {},
  ): Promise<AuditLogsResponse> {
    const response = await axiosInstance.get<{ data: AuditLogsResponse }>(
      '/auth/audit-logs',
      { params: { limit, offset, search: opts.search || undefined, includeNoise: opts.includeNoise ? 1 : undefined } }
    );
    return response.data.data || { total: 0, logs: [] };
  }

  /**
   * Setup 2FA - get QR code and secret
   */
  async setup2FA(): Promise<Setup2FAResponse> {
    const response = await axiosInstance.post<{ data: Setup2FAResponse }>(
      '/auth/2fa/setup',
      {}
    );
    return response.data.data;
  }

  /**
   * Verify 2FA setup with token
   */
  async verify2FA(token: string): Promise<Verify2FAResponse> {
    const response = await axiosInstance.post<{ data: Verify2FAResponse }>(
      '/auth/2fa/verify',
      { token }
    );
    return response.data.data;
  }

  /**
   * Disable 2FA
   */
  async disable2FA(): Promise<void> {
    await axiosInstance.post('/auth/2fa/disable', {});
  }

  /**
   * Get 2FA status
   */
  async get2FAStatus(): Promise<TwoFactorStatus> {
    const response = await axiosInstance.get<{ data: TwoFactorStatus }>(
      '/auth/2fa/status'
    );
    return response.data.data;
  }

  /**
   * Change password
   */
  async changePassword(
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ): Promise<void> {
    await axiosInstance.post(
      '/auth/change-password',
      { currentPassword, newPassword, confirmPassword }
    );
  }

  /**
   * Regenerate backup codes for 2FA
   */
  async regenerateBackupCodes(): Promise<Verify2FAResponse> {
    const response = await axiosInstance.post<{ data: Verify2FAResponse }>(
      '/auth/2fa/regenerate-backup-codes',
      {}
    );
    return response.data.data;
  }
}

export default new SecurityService();
