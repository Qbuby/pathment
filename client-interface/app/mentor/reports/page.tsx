'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  FileText, Loader2, Copy, Check, AlertTriangle, Star, TrendingUp, TrendingDown,
  Minus, ClipboardCheck, Flag, ArrowUpRight, Activity, Gauge, Sparkles, Printer, RefreshCw,
} from 'lucide-react';
import { useMentorCohort, useClanPerformance, type CohortMentee } from '@/lib/hooks/mentor';
import { mentorApi } from '@/lib/services/mentor-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { useAuth } from '@/lib/context/AuthContext';
import { useClan, resolveActiveMentorClan, ALL_CLANS } from '@/lib/context/ClanContext';
import { Avatar as SharedAvatar } from '@/components/shared/Avatar';

interface PeriodActivity {
  period: 'week' | 'month';
  days: number;
  totalMentees: number;
  tasksCompleted: number;
  onTime: number;
  onTimeRate: number;
  pointsEarned: number;
  blockersOpened: number;
  blockersResolved: number;
  activeMentees: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const pct = (n: number) => `${Math.round(n)}%`;
const firstName = (full: string) => full.split(' ')[0];
const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

/** A single, transparent next step for an at-risk mentee. */
function nextStep(m: CohortMentee): string {
  if (m.openBlockers > 0) return `Clear ${m.openBlockers} blocker${m.openBlockers > 1 ? 's' : ''}`;
  if (m.pendingApprovals > 0) return `Review ${m.pendingApprovals} submission${m.pendingApprovals > 1 ? 's' : ''}`;
  if (m.relativeProgress - m.absoluteProgress >= 15) return 'Falling behind pace - check in';
  if (m.momentum === 'down') return 'Going quiet - reach out';
  return 'Check in';
}

/**
 * The score's own bands, not a fourth set of thresholds.
 *
 * This page used to invent both the number and the words for it: a health
 * score of `progress*0.4 + onTime*0.3 + onTrackShare*0.3`, computed in the
 * browser, banded at 78/58/40. The leaderboard and the progress-score table
 * had already been moved onto the server's single score precisely because
 * three competing formulas meant one mentee had three different numbers
 * depending on which tab you opened — and Reports was the one left behind.
 * The cut-offs below are the server's (`performanceService` bands), so the
 * label on this page cannot drift from the label on the other two.
 *
 * Literal class strings (no runtime concatenation) so Tailwind keeps them.
 * The accent scales don't invert in dark mode like slate does, so each band
 * carries explicit dark: tints — otherwise the light -50 background stays
 * light while the text flips to light.
 */
const HEALTH_BANDS = [
  { min: 90, label: 'Exceptional', tone: 'text-emerald-700 dark:text-emerald-300', stroke: 'stroke-emerald-500', soft: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30' },
  { min: 80, label: 'Excellent', tone: 'text-emerald-700 dark:text-emerald-300', stroke: 'stroke-emerald-500', soft: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30' },
  { min: 70, label: 'Strong', tone: 'text-brand-700 dark:text-brand-300', stroke: 'stroke-brand-500', soft: 'bg-brand-50 border-brand-200 dark:bg-brand-500/10 dark:border-brand-500/30' },
  { min: 60, label: 'Developing', tone: 'text-amber-700 dark:text-amber-300', stroke: 'stroke-amber-500', soft: 'bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30' },
  { min: 0, label: 'Needs attention', tone: 'text-red-700 dark:text-red-300', stroke: 'stroke-red-500', soft: 'bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/30' },
] as const;
const bandFor = (score: number) => HEALTH_BANDS.find((b) => score >= b.min)!;

function MomentumPill({ momentum }: { momentum: CohortMentee['momentum'] }) {
  const cfg = {
    up: { Icon: TrendingUp, cls: 'text-emerald-600' },
    flat: { Icon: Minus, cls: 'text-slate-400' },
    down: { Icon: TrendingDown, cls: 'text-red-500' },
  }[momentum];
  return <cfg.Icon className={`w-4 h-4 ${cfg.cls}`} />;
}

export default function MentorReports() {
  // Standing and cohort clans share this reports UI; cohort data is clan-scoped via X-Active-Clan.
  const { cohort, totals, loading, error, refetch } = useMentorCohort();
  const { user } = useAuth();
  const { clans, activeClanId } = useClan();
  const clan = resolveActiveMentorClan(clans, activeClanId);
  /**
   * The same read the leaderboard and the progress-score table use.
   *
   * A score only means something against the people somebody trains with, so
   * it is per clan — "All clans" falls back to the first, exactly as
   * `/mentor/scores` does, and the clan is named on the card so it is never
   * ambiguous which one the number belongs to.
   */
  const scoreClanId = activeClanId !== ALL_CLANS ? activeClanId : (clans[0]?.id ?? null);
  const { performance } = useClanPerformance(scoreClanId);
  const historical = Boolean(clan?.frozenAt);
  const HISTORICAL_TITLE = 'Completed programs are read-only';
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [copied, setCopied] = useState(false);
  const [aiDraft, setAiDraft] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [activity, setActivity] = useState<PeriodActivity | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);

  // Period-scoped throughput - refetches when the week/month toggle changes.
  useEffect(() => {
    let cancelled = false;
    setActivityLoading(true);
    mentorApi
      .getCohortActivity(period)
      .then((res: any) => { if (!cancelled) setActivity(res?.data?.activity ?? res?.activity ?? null); })
      .catch(() => { if (!cancelled) setActivity(null); })
      .finally(() => { if (!cancelled) setActivityLoading(false); });
    return () => { cancelled = true; };
  }, [period]);

  const ranked = useMemo(() => performance?.ranked ?? [], [performance]);

  const report = useMemo(() => {
    if (!cohort.length) return null;
    const size = cohort.length;

    const avgProgress = Math.round(avg(cohort.map((m) => m.absoluteProgress)));
    const avgOnTime = Math.round(avg(cohort.map((m) => m.onTimeRate)));
    const rated = cohort.filter((m) => m.avgRating > 0);
    const avgRating = rated.length ? Number(avg(rated.map((m) => m.avgRating)).toFixed(1)) : null;

    const onTrack = cohort.filter((m) => m.risk === 'low');
    const watch = cohort.filter((m) => m.risk === 'watch');
    const high = cohort.filter((m) => m.risk === 'high');
    const atRisk = [...high, ...watch].sort((a, b) => (a.risk === 'high' ? -1 : 1) - (b.risk === 'high' ? -1 : 1));

    const rising = cohort.filter((m) => m.momentum === 'up').length;
    const steady = cohort.filter((m) => m.momentum === 'flat').length;
    const slipping = cohort.filter((m) => m.momentum === 'down').length;

    const pending = totals?.pendingApprovals ?? cohort.reduce((n, m) => n + m.pendingApprovals, 0);
    const openBlockers = totals?.openBlockers ?? cohort.reduce((n, m) => n + m.openBlockers, 0);

    /**
     * Cohort health IS the clan's average progress score.
     *
     * It used to be `progress*0.4 + onTime*0.3 + onTrackShare*0.3`, worked out
     * here in the browser — a fourth definition of "doing well" that agreed
     * with nothing. The number on the Leaderboard and the Progress scores tabs
     * is the server's one score, and this is now the mean of those same
     * scores: the identical figure the progress table prints as "Clan
     * average". Where the score has not placed anybody yet, there is no
     * average to show rather than a made-up one.
     */
    const scored = ranked.map((m) => m.score);
    const health = scored.length ? Math.round(avg(scored)) : null;

    /**
     * Top performers are the top of that same ranking.
     *
     * They were sorted by `absoluteProgress + onTimeRate`, so this page could
     * — and did — name a different three people from the podium one tab away.
     */
    const highlights = ranked.slice(0, 3);

    const actions: string[] = [];
    if (pending > 0) actions.push(`Clear ${pending} pending review${pending > 1 ? 's' : ''} in your approvals queue.`);
    if (high.length) actions.push(`Prioritise ${high.map((m) => firstName(m.name)).join(', ')} - flagged at risk.`);
    if (openBlockers > 0) actions.push(`Help unblock ${openBlockers} open roadblock${openBlockers > 1 ? 's' : ''} across the cohort.`);
    if (slipping > 0) actions.push(`Re-engage ${slipping} mentee${slipping > 1 ? 's' : ''} whose momentum is slipping.`);
    if (!actions.length) actions.push('Cohort is healthy - keep the steady cadence and celebrate the wins.');

    const band = health === null ? null : bandFor(health);
    const overview =
      `Your ${size}-mentee cohort ${band ? `scores ${band.label.toLowerCase()}` : 'has no score yet'} this ${period}: ` +
      `${avgProgress}% average progress, ${avgOnTime}% on-time delivery` +
      `${avgRating ? `, ${avgRating}★ average work quality` : ''}. ` +
      `${onTrack.length} on track, ${watch.length} to watch, ${high.length} at risk.`;

    return {
      size, avgProgress, avgOnTime, avgRating, onTrack, watch, high, atRisk,
      rising, steady, slipping, pending, openBlockers, health, band, highlights, actions, overview,
    };
  }, [cohort, totals, period, ranked]);

  const copy = async () => {
    if (!report) return;
    const lines = [
      `COHORT REPORT - this ${period}${user?.firstName ? ` · ${user.firstName}` : ''}`,
      '='.repeat(48),
      '',
      report.overview,
      '',
      ...(activity ? [
        `THIS ${period.toUpperCase()} (last ${activity.days} days)`,
        `  ${activity.tasksCompleted} tasks completed (${activity.onTimeRate}% on time) · ${activity.activeMentees}/${activity.totalMentees} active · ${activity.blockersOpened} new blockers, ${activity.blockersResolved} resolved`,
        '',
      ] : []),
      report.band === null
        ? 'Progress score: not enough reviewed work to place this clan yet'
        : `Progress score: ${report.health}/100 (${report.band.label}) — the clan average`,
      `Avg progress: ${report.avgProgress}%   On-time: ${report.avgOnTime}%${report.avgRating ? `   Quality: ${report.avgRating}★` : ''}`,
      `Momentum: ${report.rising} rising · ${report.steady} steady · ${report.slipping} slipping`,
      `Open work: ${report.pending} pending review${report.pending === 1 ? '' : 's'}, ${report.openBlockers} roadblock${report.openBlockers === 1 ? '' : 's'}`,
      '',
      'TOP PERFORMERS',
      ...(report.highlights.length
        ? report.highlights.map((m) => `  • #${m.rank} ${m.name} - ${m.score}/100 (${m.band})`)
        : ['  • Nobody is ranked yet.']),
      '',
      'NEEDS ATTENTION',
      ...(report.atRisk.length
        ? report.atRisk.map((m) => `  • ${m.name} (${m.risk}) - ${m.riskReason || 'flagged'} → ${nextStep(m)}`)
        : ['  • Nobody flagged right now.']),
      '',
      'RECOMMENDED ACTIONS',
      ...report.actions.map((a, i) => `  ${i + 1}. ${a}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true); toast.success('Report copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error('Could not copy'); }
  };

  const draftWithAI = async () => {
    try {
      setAiLoading(true);
      const res = await mentorApi.getCohortReportSummary(period);
      const text = res?.data?.summary ?? res?.summary ?? '';
      if (!text) { toast.error('The model returned an empty draft - try again'); return; }
      setAiDraft(text);
      toast.success('Draft ready - edit it, then copy or print');
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not draft the summary. Check Settings → AI Connections.'));
    } finally {
      setAiLoading(false);
    }
  };

  const copyDraft = async () => {
    if (!aiDraft) return;
    try { await navigator.clipboard.writeText(aiDraft); toast.success('Draft copied'); }
    catch { toast.error('Could not copy'); }
  };

  const printReport = () => window.print();

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-border bg-card p-6">
        <div>
          <h1 className="text-slate-900 mb-1">Cohort report</h1>
          <p className="text-slate-600">A ready-to-share read of how your mentees are doing. Drop it straight into your update.</p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
            {(['week', 'month'] as const).map((p) => (
              <button key={p} aria-pressed={period === p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${period === p ? 'bg-card text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                {p}
              </button>
            ))}
          </div>
          <button
            onClick={draftWithAI}
            disabled={!report || aiLoading || historical}
            title={historical ? HISTORICAL_TITLE : undefined}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {aiLoading ? 'Drafting…' : 'Draft with AI'}
          </button>
          <button onClick={printReport} disabled={!report}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-card px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            title="Export as PDF (print → save as PDF)">
            <Printer className="w-4 h-4" />PDF
          </button>
          <button onClick={copy} disabled={!report}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-card px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : !report ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No cohort data to report on yet</p>
          <p className="text-slate-400 text-sm mt-1">Once you have active mentees, their summary shows up here.</p>
        </div>
      ) : (
        <div id="cohort-report" className="space-y-6">
          {/* Print-only header (the on-screen title/controls are hidden when printing) */}
          <div className="hidden print:block mb-2">
            <h1 className="text-xl font-bold text-slate-900">Cohort report - this {period}</h1>
            <p className="text-sm text-slate-500">{user?.firstName ? `${user.firstName} · ` : ''}{new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>

          {/* AI-drafted narrative (editable) */}
          {aiDraft !== null && (
            <div className="rounded-2xl border border-brand-200 bg-brand-50/40 dark:bg-brand-500/10 p-5">
              <div className="no-print flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-brand-600" />
                  <h2 className="font-semibold text-slate-900">AI draft</h2>
                  <span className="text-xs text-slate-400">editable</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={draftWithAI} disabled={aiLoading}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-card disabled:opacity-50 transition-colors">
                    {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Regenerate
                  </button>
                  <button onClick={copyDraft}
                    className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-700 transition-colors">
                    <Copy className="w-3.5 h-3.5" />Copy
                  </button>
                </div>
              </div>
              <textarea
                value={aiDraft}
                onChange={(e) => setAiDraft(e.target.value)}
                rows={Math.max(5, aiDraft.split('\n').length + 1)}
                className="no-print w-full bg-transparent text-sm text-slate-700 leading-relaxed resize-y focus:outline-none"
              />
              {/* Print rendering of the (possibly edited) draft */}
              <p className="hidden print:block text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{aiDraft}</p>
            </div>
          )}

          {/* Executive summary - health + distribution */}
          <div className={`rounded-2xl border p-6 ${report.band ? report.band.soft : 'bg-card border-slate-200'}`}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              {/* The clan's average progress score — the same number the
                  Progress scores tab prints as "Clan average", and the same
                  score the Leaderboard ranks by. */}
              <div className="flex items-center gap-4 shrink-0">
                <div className="relative w-20 h-20">
                  <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                    <circle cx="18" cy="18" r="15.9155" fill="none" className="stroke-white/70" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.9155" fill="none" strokeWidth="3" strokeLinecap="round"
                      className={report.band ? report.band.stroke : 'stroke-slate-300'}
                      strokeDasharray={`${report.health ?? 0}, 100`} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-bold text-slate-900 tabular-nums leading-none">{report.health ?? '—'}</span>
                    <span className="text-[10px] text-slate-400">/ 100</span>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <Gauge className={`w-4 h-4 ${report.band ? report.band.tone : 'text-slate-400'}`} />
                    <span className={`text-sm font-semibold ${report.band ? report.band.tone : 'text-slate-500'}`}>
                      {report.band ? report.band.label : 'Not scored yet'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Progress score{clan?.name ? ` · ${clan.name}` : ''}
                  </p>
                </div>
              </div>

              {/* Narrative */}
              <p className="text-sm text-slate-700 leading-relaxed flex-1">{report.overview}</p>
            </div>

            {/* Distribution bar */}
            <div className="mt-5">
              <div className="flex h-2.5 rounded-full overflow-hidden bg-card/60">
                {report.onTrack.length > 0 && <div className="bg-emerald-500" style={{ width: `${(report.onTrack.length / report.size) * 100}%` }} />}
                {report.watch.length > 0 && <div className="bg-amber-400" style={{ width: `${(report.watch.length / report.size) * 100}%` }} />}
                {report.high.length > 0 && <div className="bg-red-500" style={{ width: `${(report.high.length / report.size) * 100}%` }} />}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />{report.onTrack.length} on track</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />{report.watch.length} to watch</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />{report.high.length} at risk</span>
              </div>
            </div>
          </div>

          {/* Period-scoped throughput - driven by the week/month toggle */}
          <div className="bg-card rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-slate-900 flex items-center gap-2"><Activity className="w-4 h-4 text-brand-500" />This {period}</h2>
              <span className="text-xs text-slate-400">{activity ? `last ${activity.days} days` : ''}</span>
            </div>
            {activityLoading ? (
              <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-brand-400" /></div>
            ) : !activity ? (
              <p className="text-sm text-slate-400">Couldn’t load activity for this window.</p>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Tasks completed', value: String(activity.tasksCompleted), sub: `${activity.onTime} on time` },
                  { label: 'On-time this period', value: activity.tasksCompleted ? `${activity.onTimeRate}%` : '-', sub: activity.tasksCompleted ? 'of completed tasks' : 'nothing completed yet' },
                  { label: 'Active mentees', value: `${activity.activeMentees}/${activity.totalMentees}`, sub: 'submitted or finished work' },
                  { label: 'Blockers', value: `${activity.blockersOpened} new`, sub: `${activity.blockersResolved} resolved` },
                ].map((c) => (
                  <div key={c.label} className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                    <div className="text-xs text-slate-500">{c.label}</div>
                    <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{c.value}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{c.sub}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Current standing (snapshot - not period-scoped) */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2 px-1">Current standing</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Avg progress', value: `${report.avgProgress}%`, sub: 'through their programs' },
                { label: 'On-time delivery', value: `${report.avgOnTime}%`, sub: 'all-time, tasks on due date' },
                { label: 'Work quality', value: report.avgRating ? `${report.avgRating}★` : '-', sub: report.avgRating ? 'avg task rating' : 'no ratings yet' },
                { label: 'Needs attention', value: String(report.atRisk.length), sub: `of ${report.size} mentees` },
              ].map((c) => (
                <div key={c.label} className="rounded-2xl bg-card border border-slate-200 px-4 py-4">
                  <div className="text-xs text-slate-500">{c.label}</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{c.value}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{c.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Momentum + Open work */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-card rounded-2xl border border-slate-200 p-6">
              <h2 className="text-slate-900 mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-brand-500" />Momentum</h2>
              <div className="space-y-3">
                {[
                  { label: 'Rising', n: report.rising, cls: 'bg-emerald-500' },
                  { label: 'Steady', n: report.steady, cls: 'bg-slate-300' },
                  { label: 'Slipping', n: report.slipping, cls: 'bg-red-500' },
                ].map((r) => (
                  <div key={r.label} className="flex items-center gap-3">
                    <span className="w-16 text-sm text-slate-600 shrink-0">{r.label}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${r.cls}`} style={{ width: `${(r.n / report.size) * 100}%` }} />
                    </div>
                    <span className="w-6 text-right text-sm font-medium text-slate-700 tabular-nums shrink-0">{r.n}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-slate-200 p-6">
              <h2 className="text-slate-900 mb-4">Open work</h2>
              <div className="space-y-3">
                <Link href="/mentor/review" className="flex items-center gap-3 group">
                  <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0"><ClipboardCheck className="w-4 h-4 text-brand-600" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700">Pending reviews</p>
                    <p className="text-xs text-slate-400">awaiting your feedback</p>
                  </div>
                  <span className="text-lg font-semibold text-slate-900 tabular-nums">{report.pending}</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-brand-500 transition-colors" />
                </Link>
                <Link href="/mentor/dashboard" className="flex items-center gap-3 group">
                  <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center shrink-0"><Flag className="w-4 h-4 text-orange-600" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700">Open roadblocks</p>
                    <p className="text-xs text-slate-400">slowing mentees down</p>
                  </div>
                  <span className="text-lg font-semibold text-slate-900 tabular-nums">{report.openBlockers}</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-orange-500 transition-colors" />
                </Link>
              </div>
            </div>
          </div>

          {/* Top performers */}
          <div className="bg-card rounded-2xl border border-slate-200 p-6">
            <h2 className="text-slate-900 mb-4 flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500" />Top performers
              <span className="text-xs font-normal text-slate-400">by progress score</span>
            </h2>
            {/* The top of the SAME ranking the Leaderboard shows. These were
                sorted by progress + on-time here, so this card could name a
                different three people from the podium one tab away. */}
            {report.highlights.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nobody is ranked yet — the score places a mentee once there is enough reviewed work behind them.
              </p>
            ) : (
              <div className="space-y-1">
                {report.highlights.map((m) => (
                  <Link key={m.id} href={`/mentor/mentees/${m.id}`}
                    className="flex items-center gap-3 -mx-2 px-2 py-2 rounded-xl hover:bg-slate-50 transition-colors group">
                    <span className="w-5 text-sm font-semibold text-slate-300 tabular-nums">{m.rank}</span>
                    <SharedAvatar name={m.name} src={m.profilePictureUrl} initials={m.avatar} size="sm" className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 truncate">{m.name}</p>
                      <p className="text-xs text-slate-400 truncate">{m.band}</p>
                    </div>
                    <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500 shrink-0">
                      <span>{m.evidence.tasksCompleted} done</span>
                      <span>{pct(m.evidence.onTimeRate)} on time</span>
                      {!!m.evidence.avgRating && (
                        <span className="inline-flex items-center gap-0.5 text-amber-600">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />{m.evidence.avgRating}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-slate-900 tabular-nums shrink-0">{m.score}</span>
                    <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-brand-500 transition-colors shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Needs attention */}
          <div className="bg-card rounded-2xl border border-slate-200 p-6">
            <h2 className="text-slate-900 mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" />Needs attention</h2>
            {report.atRisk.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Check className="w-4 h-4 text-emerald-500" />Nobody’s flagged right now - nice work.
              </div>
            ) : (
              <div className="space-y-2">
                {report.atRisk.map((m) => (
                  <Link key={m.id} href={`/mentor/mentees/${m.id}`}
                    className="flex items-start gap-3 -mx-2 px-2 py-2.5 rounded-xl hover:bg-slate-50 transition-colors group">
                    <SharedAvatar name={m.name} src={m.profilePictureUrl} initials={m.avatar} size="md" className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-900 truncate">{m.name}</p>
                        <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-medium ${m.risk === 'high' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                          {m.risk === 'high' ? 'At risk' : 'Watch'}
                        </span>
                        <MomentumPill momentum={m.momentum} />
                      </div>
                      {m.riskReason && <p className="text-xs text-slate-500 mt-0.5">{m.riskReason}</p>}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-slate-400">
                        <span>{pct(m.absoluteProgress)} progress</span>
                        {m.pendingApprovals > 0 && <span className="text-brand-600">{m.pendingApprovals} to review</span>}
                        {m.openBlockers > 0 && <span className="text-orange-600">{m.openBlockers} roadblock{m.openBlockers > 1 ? 's' : ''}</span>}
                        <span>last active {m.lastActive}</span>
                      </div>
                    </div>
                    <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-slate-600 group-hover:text-brand-600 shrink-0 mt-0.5">
                      {nextStep(m)} <ArrowUpRight className="w-3.5 h-3.5" />
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recommended actions */}
          <div className="bg-card rounded-2xl border border-slate-200 p-6">
            <h2 className="text-slate-900 mb-3">Recommended actions</h2>
            <ol className="space-y-2.5">
              {report.actions.map((a, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
                  <span className="w-5 h-5 rounded-full bg-brand-50 text-brand-600 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  {a}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {/* Print isolation: only the report region prints, at full width. */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden !important; }
          #cohort-report, #cohort-report * { visibility: visible !important; }
          #cohort-report { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          #cohort-report .rounded-2xl, #cohort-report .rounded-xl { box-shadow: none !important; }
        }
      ` }} />
    </div>
  );
}
