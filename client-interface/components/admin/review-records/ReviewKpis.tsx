import { CalendarRange, Percent, Users, Clock } from 'lucide-react';
import { MetricTile } from '@/components/shared/MetricTile';
import { fmtMin, pct, type Summary } from './review-records-constants';

interface ReviewKpisProps {
  summary: Summary;
  /** Roster entries across the sessions in view (reviewed + not reviewed). */
  totalEntries: number;
}

/** Headline numbers, in the same tiles the admin Overview uses. */
export function ReviewKpis({ summary, totalEntries }: ReviewKpisProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <MetricTile compact tone={0} icon={CalendarRange} label="Review sessions" value={summary.sessions.toLocaleString()} hint={`${summary.withVideo} ran with live video (${pct(summary.withVideo, summary.sessions)}%)`} />
      <MetricTile compact tone={1} icon={Percent} label="Attendance rate" value={`${summary.attendanceRate}%`} hint={`${summary.present.toLocaleString()} of ${summary.marked.toLocaleString()} marked present`} />
      <MetricTile compact tone={2} icon={Users} label="Mentees reviewed" value={summary.reviewed.toLocaleString()} hint={`${pct(summary.reviewed, totalEntries)}% of ${totalEntries.toLocaleString()} roster entries`} />
      <MetricTile compact tone={3} icon={Clock} label="Talk time" value={fmtMin(summary.talkSeconds)} hint={`${fmtMin(summary.sessions ? summary.talkSeconds / summary.sessions : 0)} average per session`} />
    </div>
  );
}
