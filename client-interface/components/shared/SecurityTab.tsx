'use client';

import { useState, useEffect } from 'react';
import {
  Lock,
  Shield,
  Eye,
  EyeOff,
  Copy,
  Check,
  X,
  // LogOut,
  Loader2,
  // Smartphone,
  // Laptop,
  // Globe,
  AlertCircle,
  CheckCircle2,
  Clock,
  Key
} from 'lucide-react';
import securityService, {
  // Session,
  TwoFactorStatus,
  AuditLog,
} from '@/lib/services/security-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { validatePassword } from '@/lib/utils/validation';
import { PasswordRequirements } from './PasswordRequirements';
import { BackupCodesModal } from './BackupCodesModal';
import { TablePagination } from './TablePagination';
import { usePagination } from '@/lib/hooks/shared/usePagination';
import { Spinner } from './LoadingSpinner';

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// const getDeviceIcon = (deviceType?: string) => {
//   switch (deviceType?.toLowerCase()) {
//     case 'mobile':
//       return <Smartphone className="w-4 h-4" />;
//     case 'tablet':
//       return <Smartphone className="w-4 h-4" />;
//     default:
//       return <Laptop className="w-4 h-4" />;
//   }
// };

const getApiErrorMessage = (err: any, fallback: string) => extractApiErrorMessage(err, fallback);

interface PasswordChangeFormProps {
  onClose: () => void;
  onSubmit: (current: string, newPassword: string, confirm: string) => Promise<void>;
}

function PasswordChangeForm({ onClose, onSubmit }: PasswordChangeFormProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    const pw = validatePassword(newPassword);
    if (!pw.valid) {
      setError(pw.errors[0]);
      return;
    }

    setLoading(true);
    try {
      await onSubmit(currentPassword, newPassword, confirmPassword);
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not change password'));
    } finally {
      setLoading(false);
    }
  };

  return (
       <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
      <div className="bg-card rounded-2xl max-w-md w-full mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Change Password</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-slate-700 mb-2 text-sm font-medium">Current Password</label>
            <div className="relative">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full pl-4 pr-12 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Enter your current password"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              >
                {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-slate-700 mb-2 text-sm font-medium">New Password</label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full pl-4 pr-12 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Enter new password"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <PasswordRequirements password={newPassword} />
          </div>

          <div>
            <label className="block text-slate-700 mb-2 text-sm font-medium">Confirm New Password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-4 pr-12 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Confirm new password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:bg-brand-400 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              Change Password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface Setup2FAFormProps {
  onClose: () => void;
  onSetupComplete: () => void;
}

function Setup2FAForm({ onClose, onSetupComplete }: Setup2FAFormProps) {
  const [step, setStep] = useState<'setup' | 'verify'>('setup');
  const [qrCode, setQrCode] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const init2FA = async () => {
      setLoading(true);
      try {
        const result = await securityService.setup2FA();
        setQrCode(result.qrCode);
        setManualKey(result.manualEntryKey);
      } catch (err) {
        setError('Could not start two-factor setup. Try again.');
      } finally {
        setLoading(false);
      }
    };

    init2FA();
  }, []);

  const handleVerify = async () => {
    if (!verifyToken || verifyToken.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setLoading(true);
    try {
      await securityService.verify2FA(verifyToken);
      onSetupComplete();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Invalid code'));
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(manualKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60 p-4">
      <div className="bg-card rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Enable Two-Factor Authentication</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 'setup' && (
          <div className="space-y-3 sm:space-y-4">
            <p className="text-sm text-slate-600">
              Scan this QR code with your authenticator app (Google Authenticator, Authy, Microsoft Authenticator)
            </p>

            {qrCode && <img src={qrCode} alt="2FA QR Code" className="w-full max-w-xs mx-auto" />}

            <div className="space-y-2">
              <p className="text-sm text-slate-600">Or enter this key manually:</p>
              <div className="flex gap-2 items-center">
                <code className="flex-1 p-3 bg-slate-50 rounded-lg text-xs sm:text-sm font-mono overflow-x-auto">
                  {manualKey}
                </code>
                <button
                  onClick={copyToClipboard}
                  className="p-2 hover:bg-slate-100 rounded-lg flex-shrink-0"
                  title="Copy to clipboard"
                >
                  {copied ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              onClick={() => setStep('verify')}
              className="w-full px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
            >
              I&apos;ve Scanned the Code
            </button>
          </div>
        )}

        {step === 'verify' && (
          <div className="space-y-3 sm:space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <p className="text-sm text-slate-600">
              Enter the 6-digit code from your authenticator app
            </p>

            <input
              type="text"
              value={verifyToken}
              onChange={(e) => setVerifyToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              placeholder="000000"
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-center text-2xl tracking-widest"
            />

            <div className="flex gap-2">
              <button
                onClick={() => setStep('setup')}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleVerify}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:bg-brand-400 transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify & Enable'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface SecurityTabProps {
  userRole?: 'admin' | 'mentor' | 'mentee';
  showAuditLogs?: boolean;
}

export default function SecurityTab({ showAuditLogs = false }: SecurityTabProps) {
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [setup2FAModalOpen, setSetup2FAModalOpen] = useState(false);
  const [backupCodesModalOpen, setBackupCodesModalOpen] = useState(false);
  // const [sessions, setSessions] = useState<Session[]>([]);
  const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  /**
   * The access log is a searchable, paged read now.
   *
   * It used to fetch the newest fifty and drop them into a 384px scroll box:
   * no search, no paging, and session heartbeats outnumbering everything a
   * person actually did. Every one of those is a separate reason the screen
   * could not answer "what happened to this account last Tuesday".
   */
  const [logSearch, setLogSearch] = useState('');
  const [logQuery, setLogQuery] = useState('');
  const [showBackground, setShowBackground] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const logsPg = usePagination({ initialPage: 1, initialLimit: 20 });
  const [loading, setLoading] = useState(true);
  const [disabling2FA, setDisabling2FA] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    loadSecurityData();
  }, []);

  const loadSecurityData = async () => {
    setLoading(true);
    try {
      // const [sessionsData, twoFactorData] = await Promise.all([
      //   securityService.getActiveSessions(),
      //   securityService.get2FAStatus()
      // ]);
      const twoFactorData = await securityService.get2FAStatus();

      // setSessions(sessionsData);
      setTwoFactorStatus(twoFactorData);

      // The log loads on its own, below, so searching or paging it does not
      // re-fetch the 2FA status alongside.

    } catch (error) {
      console.error('Failed to load security data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setLogQuery(logSearch.trim()); logsPg.goToPage(1); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logSearch]);

  const logsPage = logsPg.page;
  const logsLimit = logsPg.limit;
  const setLogsTotal = logsPg.setTotal;
  useEffect(() => {
    if (!showAuditLogs) return;
    let live = true;
    setLogsLoading(true);
    securityService
      .getAuditLogs(logsLimit, (logsPage - 1) * logsLimit, { search: logQuery, includeNoise: showBackground })
      .then((data) => { if (!live) return; setAuditLogs(data.logs); setLogsTotal(data.total); })
      .catch(() => { if (live) setAuditLogs([]); })
      .finally(() => { if (live) setLogsLoading(false); });
    return () => { live = false; };
  }, [showAuditLogs, logsPage, logsLimit, logQuery, showBackground, setLogsTotal]);

  const handleChangePassword = async (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ) => {
    await securityService.changePassword(currentPassword, newPassword, confirmPassword);
    setSuccessMessage('Password changed successfully');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleDisable2FA = async () => {
    setDisabling2FA(true);
    try {
      await securityService.disable2FA();
      setTwoFactorStatus({ ...twoFactorStatus!, enabled: false, enabledAt: null });
      setSuccessMessage('2FA disabled successfully');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Failed to disable 2FA:', error);
    } finally {
      setDisabling2FA(false);
    }
  };

  // const handleRevokeSession = async (sessionId: string) => {
  //   try {
  //     await securityService.revokeSession(sessionId);
  //     setSessions(sessions.filter(s => s.id !== sessionId));
  //   } catch (error) {
  //     console.error('Failed to revoke session:', error);
  //   }
  // };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {successMessage && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircle2 className="w-5 h-5" />
          {successMessage}
        </div>
      )}

      {/* Password Section */}
      <div className="space-y-3">
        <h3 className="text-slate-900 font-semibold flex items-center gap-2">
          <Lock className="w-5 h-5" />
          Password Security
        </h3>
        <div className="p-6 border border-slate-200 rounded-xl">
          <p className="text-slate-600 mb-4">
            Keep your account secure by using a strong password
          </p>
          <button
            onClick={() => setPasswordModalOpen(true)}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors"
          >
            Change Password
          </button>
        </div>
      </div>

      {/* Two-Factor Authentication Section */}
      <div className="space-y-3">
        <h3 className="text-slate-900 font-semibold flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Two-Factor Authentication
        </h3>
        <div className="p-6 border border-slate-200 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-slate-900 font-medium">
                Status: {twoFactorStatus?.enabled ? 'Enabled' : 'Disabled'}
              </p>
              {twoFactorStatus?.enabled && (
                <p className="text-sm text-slate-600">
                  Enabled since {formatDate(twoFactorStatus.enabledAt || '')}
                </p>
              )}
            </div>
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              twoFactorStatus?.enabled 
                ? 'bg-green-100 text-green-700' 
                : 'bg-slate-100 text-slate-700'
            }`}>
              {twoFactorStatus?.enabled ? '✓ Enabled' : 'Not Enabled'}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {!twoFactorStatus?.enabled ? (
              <button
                onClick={() => setSetup2FAModalOpen(true)}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors"
              >
                Enable 2FA
              </button>
            ) : (
              <>
                <button
                  onClick={() => setBackupCodesModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                >
                  <Key className="w-4 h-4" />
                  Backup Codes
                </button>
                <button
                  onClick={handleDisable2FA}
                  disabled={disabling2FA}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:bg-red-400"
                >
                  {disabling2FA ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Disable 2FA'}
                </button>
              </>
            )}
          </div>

          {twoFactorStatus?.enabled && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Backup Codes:</p>
                <p>{twoFactorStatus.remainingBackupCodes} backup codes remaining</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Active Sessions Section intentionally commented out per maintainer request.
      <div className="space-y-3">
        <h3 className="text-slate-900 font-semibold flex items-center gap-2">
          <Smartphone className="w-5 h-5" />
          Active Sessions ({sessions.length})
        </h3>
        {sessions.length > 0 ? (
          <div className="space-y-2">
            {sessions.map((session) => (
              <div key={session.id} className="p-4 border border-slate-200 rounded-lg flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className="p-2 bg-slate-100 rounded-lg">
                    {getDeviceIcon(session.deviceType)}
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-900 font-medium">
                      {session.deviceType || 'Unknown Device'}
                    </p>
                    <p className="text-sm text-slate-600 flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      {session.ipAddress}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Active {session.isActive ? 'now' : `since ${formatDate(session.lastActivityAt)}`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleRevokeSession(session.id)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Revoke this session"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 bg-slate-50 rounded-lg text-slate-600 text-center">
            No active sessions
          </div>
        )}
      </div>
      */}

      {/* Admin Access Log Section */}
      {showAuditLogs && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-slate-900 font-semibold flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Access log
              </h3>
              <p className="mt-0.5 text-sm text-slate-500">
                What this account did, newest first. Search by what happened, by area, or by IP.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={showBackground}
                onChange={(e) => { setShowBackground(e.target.checked); logsPg.goToPage(1); }}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Include background activity
            </label>
          </div>

          <input
            value={logSearch}
            onChange={(e) => setLogSearch(e.target.value)}
            placeholder="Search the log — e.g. clan, sign in, 223.123."
            aria-label="Search the access log"
            className="w-full rounded-xl border border-slate-200 bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700"
          />

          {logsLoading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : auditLogs.length > 0 ? (
            <>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                {auditLogs.map((log) => (
                  <li key={log.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
                    <p className="min-w-0 flex-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                      {log.label || log.action}
                      {/* A request that did not succeed is the single most
                          useful thing in an access log and was invisible. */}
                      {log.failed && (
                        <span className="ml-2 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:bg-red-500/15 dark:text-red-300">
                          failed{log.status ? ` · ${log.status}` : ''}
                        </span>
                      )}
                      {log.noise && (
                        <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          background
                        </span>
                      )}
                    </p>
                    <span className="shrink-0 text-xs text-slate-500">{formatDate(log.createdAt)}</span>
                    <p className="w-full text-xs text-slate-500 dark:text-slate-400">
                      {[log.summary, log.target, log.device, log.ipAddress && `IP ${log.ipAddress}`]
                        .filter(Boolean).join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
              <TablePagination pagination={logsPg} />
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
              {logQuery
                ? <>Nothing matches &ldquo;{logQuery}&rdquo;.{!showBackground && ' Background activity is hidden — tick the box above to include it.'}</>
                : 'Nothing recorded for this account yet.'}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {passwordModalOpen && (
        <PasswordChangeForm
          onClose={() => setPasswordModalOpen(false)}
          onSubmit={handleChangePassword}
        />
      )}

      {setup2FAModalOpen && (
        <Setup2FAForm
          onClose={() => setSetup2FAModalOpen(false)}
          onSetupComplete={loadSecurityData}
        />
      )}

      <BackupCodesModal
        isOpen={backupCodesModalOpen}
        onClose={() => setBackupCodesModalOpen(false)}
        onCodesRegenerated={loadSecurityData}
      />
    </div>
  );
}
