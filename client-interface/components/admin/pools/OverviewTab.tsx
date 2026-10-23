'use client';

import { AlertTriangle, CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck, Target, UsersRound, Waypoints } from 'lucide-react';
import { MetricTile } from '@/components/shared/MetricTile';
import type { PoolDashboard } from '@/lib/services/pool-api';
import { PanelHeader, fmtDate, panel } from './poolUi';

/** Where everybody is, and what needs a person right now. */
export function OverviewTab({ data, onGo }: { data: PoolDashboard; onGo: (tab: string) => void }) {
  const { pool, members, buckets, assignments } = data;
  const live = members.filter((m) => m.bucket !== 'withdrawn');
  const withdrawn = members.length - live.length;
  // Handed-in pieces, so it matches the Review tab's queue — a person with one
  // piece in and one still open is waiting on a reviewer too.
  const needsReview = live.reduce((n, m) => n + m.work.filter((w) => w.status === 'submitted').length, 0);
  const reviewPeople = live.filter((m) => m.work.some((w) => w.status === 'submitted')).length;
  const invitePending = buckets.invite_pending || 0;
  const stalled = buckets.stalled || 0;
  const changesRequested = live.filter((m) => m.work.some((w) => w.status === 'revision_needed')).length;
  const allDone = buckets.completed || 0;
  const inactivityDays = pool.reminderPolicy?.inactivityDays;
  const expiredInvites = members.filter((m) => m.bucket === 'invite_pending' && m.invite?.expired).length;
  const failedPlacements = members.filter((m) => m.placementStatus === 'failed').length;
  const pendingPlacement = members.filter((m) => m.decision === 'selected' && m.placementStatus !== 'placed').length;
  const selected = members.filter((m) => m.decision === 'selected').length;
  const placed = members.filter((m) => m.placementStatus === 'placed').length;
  const live_work = assignments.filter((a) => !a.cancelledAt);
  // Work worth nothing cannot separate anybody, which is the one thing a
  // selection round has to do. Worth saying before the shortlist is generated.
  const worthless = live_work.filter((a) => !a.points).length;

  const attention = [
    !live_work.length && { text: 'No qualifying work yet — a score is the points earned, so there is nothing to rank on', tab: 'work' },
    live_work.length > 0 && worthless === live_work.length && { text: 'Every piece of work is worth 0 points, so nobody can be ranked', tab: 'work' },
    live_work.length > 0 && worthless > 0 && worthless < live_work.length && { text: `${worthless} piece${worthless === 1 ? ' of work is' : 's of work are'} worth 0 points`, tab: 'work' },
    needsReview > 0 && { text: `${needsReview} piece${needsReview === 1 ? ' of work is' : 's of work are'} waiting for a review`, tab: 'review' },
    expiredInvites > 0 && { text: `${expiredInvites} invitation${expiredInvites === 1 ? ' has' : 's have'} expired — resend them`, tab: 'candidates' },
    stalled > 0 && { text: `${stalled} candidate${stalled === 1 ? ' has' : 's have'} had no activity${inactivityDays ? ` in ${inactivityDays} days` : ' lately'}`, tab: 'candidates' },
    failedPlacements > 0 && { text: `${failedPlacements} placement${failedPlacements === 1 ? '' : 's'} failed — fix and retry`, tab: 'placement' },
    pendingPlacement > 0 && failedPlacements === 0 && { text: `${pendingPlacement} selected candidate${pendingPlacement === 1 ? '' : 's'} not placed yet`, tab: 'placement' },
  ].filter(Boolean) as { text: string; tab: string }[];

  // Only what the tiles above do not already say: the dates, the work, and
  // where the rest of the candidates are.
  const muted = (text: string) => <span className="ml-1 text-xs font-normal text-muted-foreground">{text}</span>;
  const round: { label: string; value: React.ReactNode }[] = [
    { label: 'Opens', value: fmtDate(pool.opensAt) },
    { label: 'Closes', value: fmtDate(pool.closesAt) },
    { label: 'Qualification deadline', value: fmtDate(pool.qualificationDueAt) },
    { label: 'Pieces of work', value: <>{live_work.length}{live_work.length ? muted(`${live_work.reduce((sum, a) => sum + a.points, 0)} pts in total`) : null}</> },
    { label: 'Invite pending', value: <>{invitePending}{expiredInvites ? muted(`${expiredInvites} expired`) : muted('no account yet')}</> },
    { label: 'Stalled', value: <>{stalled}{muted(inactivityDays ? `no activity in ${inactivityDays} days` : 'no recent activity')}</> },
    { label: 'Changes requested', value: <>{changesRequested}{muted('waiting to resubmit')}</> },
    { label: 'All work done', value: <>{allDone}{muted('every piece approved')}</> },
  ];

  return (
    <div className="space-y-6">
      {/* Each tile is one plain question about the round, and opens where to act on it. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <button onClick={() => onGo('candidates')} className="text-left">
          <MetricTile label="Active candidates" value={live.length} icon={UsersRound} tone={0}
            hint={[pool.capacity ? `Room for ${pool.capacity}` : 'No capacity limit', withdrawn ? `${withdrawn} withdrawn` : ''].filter(Boolean).join(' · ')} compact />
        </button>
        <button onClick={() => onGo('review')} className="text-left">
          <MetricTile label="Needs review" value={needsReview} icon={ClipboardCheck} tone={1}
            hint={needsReview ? `Handed in by ${reviewPeople} candidate${reviewPeople === 1 ? '' : 's'}` : 'Nothing handed in to review'} compact />
        </button>
        <button onClick={() => onGo('shortlist')} className="text-left">
          <MetricTile label="Selected" value={`${selected} / ${pool.selectionQuota}`} icon={Target} tone={2} hint="Against the selection quota" compact />
        </button>
        <button onClick={() => onGo('placement')} className="text-left">
          <MetricTile label="Placed in a clan" value={placed} icon={Waypoints} tone={3} hint={pendingPlacement ? `${pendingPlacement} still to place` : 'Nobody waiting to be placed'} compact />
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={panel}>
          <PanelHeader icon={AlertTriangle} title="Needs attention" count={attention.length} />
          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            {attention.length === 0 ? (
              <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" /> Nothing is waiting on a person right now.
              </p>
            ) : (
              <ul className="space-y-2">
                {attention.map((a) => (
                  <li key={a.text}>
                    <button onClick={() => onGo(a.tab)} className="flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 transition-colors hover:bg-amber-100">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" /> <span className="flex-1">{a.text}</span> <ChevronRight className="h-4 w-4 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className={panel}>
          <PanelHeader icon={CalendarDays} title="The round" />
          <dl className="grid grid-cols-2 border-t border-border">
            {round.map((r, i) => (
              <div key={r.label} className={`px-5 py-3 sm:px-6 ${i % 2 ? 'border-l border-border' : ''} ${i > 1 ? 'border-t border-border' : ''}`}>
                <dt className="text-xs text-muted-foreground">{r.label}</dt>
                <dd className="mt-0.5 text-sm font-medium text-slate-900 tabular-nums">{r.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
