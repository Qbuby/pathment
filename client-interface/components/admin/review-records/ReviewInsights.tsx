import { AlertTriangle, CheckCircle2, Info, Lightbulb } from 'lucide-react';
import { fmtMin, pct, type GroupRow, type SessionRow, type Summary } from './review-records-constants';

interface ReviewInsightsProps {
  summary: Summary;
  byClan: GroupRow[];
  sessions: SessionRow[];
  /** Roster entries with no attendance marked. */
  unmarked: number;
}

type Tone = 'good' | 'attention' | 'info';

const TONE: Record<Tone, { icon: React.ElementType; iconClass: string }> = {
  good: { icon: CheckCircle2, iconClass: 'text-emerald-600' },
  attention: { icon: AlertTriangle, iconClass: 'text-amber-600' },
  info: { icon: Info, iconClass: 'text-slate-400' },
};

/** Plain-language takeaways derived from the same numbers the charts show. */
export function ReviewInsights({ summary, byClan, sessions, unmarked }: ReviewInsightsProps) {
  const rated = byClan.filter((g) => g.marked > 0).sort((a, b) => b.attendanceRate - a.attendanceRate);
  const best = rated[0];
  const worst = rated.length > 1 ? rated[rated.length - 1] : null;
  const inProgress = sessions.filter((s) => s.status === 'in_progress').length;

  const insights: { tone: Tone; text: string }[] = [];
  if (best) insights.push({ tone: 'good', text: `${best.label} has the highest attendance rate (${best.attendanceRate}%).` });
  if (best && worst && worst.attendanceRate < best.attendanceRate) {
    insights.push({ tone: worst.attendanceRate < 75 ? 'attention' : 'info', text: `${worst.label} has the lowest attendance rate (${worst.attendanceRate}%).` });
  }
  if (unmarked > 0) insights.push({ tone: 'attention', text: `${unmarked.toLocaleString()} roster ${unmarked === 1 ? 'entry has' : 'entries have'} no attendance marked.` });
  if (inProgress > 0) insights.push({ tone: 'attention', text: `${inProgress} ${inProgress === 1 ? 'session is' : 'sessions are'} still in progress.` });
  insights.push({ tone: 'info', text: `${summary.withVideo} of ${summary.sessions} sessions (${pct(summary.withVideo, summary.sessions)}%) ran with live video.` });
  if (summary.talkSeconds > 0) insights.push({ tone: 'info', text: `Mentees spoke for ${fmtMin(summary.talkSeconds / summary.sessions)} per session on average.` });

  return (
    <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-3">
        <Lightbulb className="w-4 h-4 text-emerald-600" aria-hidden="true" />
        At a glance
      </h3>
      <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {insights.map(({ tone, text }) => {
          const { icon: Icon, iconClass } = TONE[tone];
          return (
            <li key={text} className="flex items-start gap-2 text-sm text-slate-700">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconClass}`} aria-hidden="true" />
              {text}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
