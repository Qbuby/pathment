import { CalendarRange, Percent, Users, Clock, Video } from 'lucide-react';
import { StatsCard } from '@/components/admin/ui';
import { fmtMin, pct, type Summary } from './review-records-constants';

interface ReviewKpisProps {
  summary: Summary;
  /** Roster entries across the sessions in view (reviewed + not reviewed). */
  totalEntries: number;
}

export function ReviewKpis({ summary, totalEntries }: ReviewKpisProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      <StatsCard icon={CalendarRange} label="Sessions" value={summary.sessions} sub="review sessions held" colorClass="text-emerald-600 bg-emerald-50" />
      <StatsCard icon={Percent} label="Attendance" value={`${summary.attendanceRate}%`} sub={`${summary.present} of ${summary.marked} marked present`} colorClass="text-amber-600 bg-amber-50" />
      <StatsCard icon={Users} label="Mentees reviewed" value={summary.reviewed} sub={`${pct(summary.reviewed, totalEntries)}% of ${totalEntries.toLocaleString()} roster entries`} colorClass="text-blue-600 bg-blue-50" />
      <StatsCard icon={Clock} label="Talk time" value={fmtMin(summary.talkSeconds)} sub={`${fmtMin(summary.sessions ? summary.talkSeconds / summary.sessions : 0)} avg per session`} colorClass="text-purple-600 bg-purple-50" />
      <StatsCard icon={Video} label="Live video" value={`${pct(summary.withVideo, summary.sessions)}%`} sub={`${summary.withVideo} of ${summary.sessions} sessions`} colorClass="text-brand-600 bg-brand-50" />
    </div>
  );
}
