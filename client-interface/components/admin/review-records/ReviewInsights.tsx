import { Lightbulb } from 'lucide-react';
import { fmtMin, pct, type GroupRow, type SessionRow, type Summary } from './review-records-constants';

interface ReviewInsightsProps {
  summary: Summary;
  byClan: GroupRow[];
  sessions: SessionRow[];
  /** Roster entries with no attendance marked. */
  unmarked: number;
}

/** Plain-language callouts derived from the same numbers the charts show. */
export function ReviewInsights({ summary, byClan, sessions, unmarked }: ReviewInsightsProps) {
  const rated = byClan.filter((g) => g.marked > 0).sort((a, b) => b.attendanceRate - a.attendanceRate);
  const best = rated[0];
  const worst = rated.length > 1 ? rated[rated.length - 1] : null;
  const inProgress = sessions.filter((s) => s.status === 'in_progress').length;

  const insights: string[] = [];
  if (best) insights.push(`${best.label} has the highest attendance rate (${best.attendanceRate}%).`);
  if (best && worst && worst.attendanceRate < best.attendanceRate) insights.push(`${worst.label} has the lowest attendance rate (${worst.attendanceRate}%).`);
  insights.push(`${summary.withVideo} of ${summary.sessions} sessions (${pct(summary.withVideo, summary.sessions)}%) ran with live video.`);
  if (summary.talkSeconds > 0) insights.push(`Mentees spoke for ${fmtMin(summary.talkSeconds / summary.sessions)} per session on average.`);
  if (unmarked > 0) insights.push(`${unmarked.toLocaleString()} roster ${unmarked === 1 ? 'entry has' : 'entries have'} no attendance marked.`);
  if (inProgress > 0) insights.push(`${inProgress} ${inProgress === 1 ? 'session is' : 'sessions are'} still in progress.`);

  return (
    <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-4">
        <Lightbulb className="w-4 h-4 text-emerald-600" aria-hidden="true" />
        Quick insights
      </h3>
      <ul className="space-y-3">
        {insights.map((text) => (
          <li key={text} className="flex items-start gap-2.5 text-sm text-slate-700">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
            {text}
          </li>
        ))}
      </ul>
    </section>
  );
}
