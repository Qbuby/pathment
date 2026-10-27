'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Users,
  UserCheck,
  Clock,
  CheckCircle2,
  Route,
  Share2,
  Link as LinkIcon,
  Loader2,
  ChevronDown,
  Pencil,
  ArrowUpRight,
} from 'lucide-react';
import { ResourceError } from '@/components/shared/ResourceError';
import { useProgramDetail } from '@/lib/hooks/admin';
import { MenuPanel } from '@/components/shared/MenuPanel';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { EditProgramDrawer } from '@/components/admin/EditProgramDrawer';
import { ProgramCompletionPanel } from '@/components/admin/ProgramCompletionPanel';
import { completionApi } from '@/lib/services/program-completion-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';

type ProgramStatus = 'draft' | 'published' | 'archived' | 'completed';

const STATUS_CONFIG: Record<ProgramStatus, { label: string; badge: string; dot: string }> = {
  draft:     { label: 'Draft',     badge: 'bg-slate-100 text-slate-700 border border-slate-200',    dot: 'bg-slate-400' },
  published: { label: 'Published', badge: 'bg-green-100 text-green-700 border border-green-200',     dot: 'bg-green-500' },
  archived:  { label: 'Archived',  badge: 'bg-amber-100 text-amber-700 border border-amber-200',     dot: 'bg-amber-500' },
  completed: { label: 'Completed', badge: 'bg-blue-100 text-blue-700 border border-blue-200',        dot: 'bg-blue-500' },
};

const STATUS_TRANSITIONS: Record<ProgramStatus, { value: ProgramStatus; label: string; description: string; confirm?: string }[]> = {
  draft: [
    { value: 'published', label: 'Publish',         description: 'Make visible to mentees & enable enrollment' },
    { value: 'archived',  label: 'Archive',          description: 'Hide without publishing', confirm: 'Archive this draft program?' },
  ],
  published: [
    { value: 'archived',  label: 'Archive',           description: 'Disable enrollment & hide from mentees', confirm: 'Archive this program? Active enrollees may be affected.' },
  ],
  archived: [
    { value: 'published', label: 'Re-publish',        description: 'Make program active again' },
    { value: 'draft',     label: 'Restore to Draft',  description: 'Move back to editable draft' },
  ],
  completed: [],
};

function StatusSelector({
  status,
  programId,
  onUpdate,
  updating,
  onLifecycleChange,
}: {
  status: string;
  programId: string;
  onUpdate: (s: string) => void;
  updating: boolean;
  onLifecycleChange: () => void;
}) {
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const s = STATUS_CONFIG[status as ProgramStatus] ?? STATUS_CONFIG.draft;
  const transitions = STATUS_TRANSITIONS[status as ProgramStatus] ?? [];
  const isClosed = status === 'completed';
  const showReopen = isClosed;
  const menuOpenable = transitions.length > 0 || showReopen;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = async (t: (typeof transitions)[0]) => {
    setOpen(false);
    if (t.confirm && !(await confirm({ title: t.confirm }))) return;
    onUpdate(t.value);
  };

  const handleReopenProgram = async () => {
    setOpen(false);
    if (!(await confirm({
      title: 'Reopen this program?',
      description: 'This unfreezes cohort clans so you can make corrections.',
      confirmLabel: 'Reopen program',
    }))) return;
    setBusy(true);
    try {
      await completionApi.reopen(programId, 'Reopened for correction');
      toast.success('Program reopened');
      onLifecycleChange();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not reopen the program'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={updating || busy || !menuOpenable}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          s.badge
        } ${updating || busy ? 'opacity-60 cursor-not-allowed' : menuOpenable ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
        {(updating || busy) ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
        {s.label}
        {menuOpenable && !updating && !busy && <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>

      {open && menuOpenable && (
        <MenuPanel align="start" width="w-64">
          {transitions.length > 0 && (
            <>
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Change Status</p>
              </div>
              {transitions.map((t) => {
                const cfg = STATUS_CONFIG[t.value];
                return (
                  <button
                    key={t.value}
                    onClick={() => handleSelect(t)}
                    className="w-full flex items-start gap-3 px-3 py-3 hover:bg-slate-50 transition-colors text-left"
                  >
                    <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                    <div>
                      <p className="text-sm font-medium text-slate-800">{t.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
                    </div>
                  </button>
                );
              })}
            </>
          )}
          {showReopen && (
            <button
              type="button"
              onClick={() => void handleReopenProgram()}
              className="w-full flex items-start gap-3 px-3 py-3 hover:bg-slate-50 transition-colors text-left"
            >
              <span className="mt-1 w-2 h-2 rounded-full shrink-0 bg-amber-500" />
              <div>
                <p className="text-sm font-medium text-slate-800">Reopen for correction</p>
                <p className="text-xs text-slate-500 mt-0.5">Unfreeze cohort clans to fix data</p>
              </div>
            </button>
          )}
        </MenuPanel>
      )}

    </div>
  );
}

export default function ProgramDetails() {
  const {
    id, program, loading,
    shareOpen, shareRef, setShareOpen, copyToClipboard,
    handleStatusUpdate, handleVisibilityUpdate, updatingStatus,
    refetch,
    errorStatus,
  } = useProgramDetail();

  const [editOpen, setEditOpen] = useState(false);

  /** The enrolments screen, already narrowed to this programme. */
  const enrollmentsHref = `/admin/enrollment/overview?programId=${encodeURIComponent(id ?? '')}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!program) {
    return (
      <div className="bg-card rounded-2xl border border-slate-200 p-12">
        <ResourceError
          status={errorStatus ?? 404}
          resource="program"
          backHref="/admin/programs/list"
          backLabel="Back to Programs"
        />
      </div>
    );
  }

  return (
    <>
      <ProgramCompletionPanel
        programId={id}
        programName={program.name}
        status={program.status}
        onClosed={() => { void refetch(); }}
      />
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/admin/programs/list"
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Programs
        </Link>
        
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-slate-900">{program.name}</h1>
              <StatusSelector
                status={program.status}
                programId={id}
                onUpdate={handleStatusUpdate}
                updating={updatingStatus}
                onLifecycleChange={refetch}
              />
              <button
                type="button"
                onClick={() => handleVisibilityUpdate(program.visibility === 'public' ? 'private' : 'public')}
                disabled={updatingStatus}
                title="Toggle whether mentees can discover this program"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors disabled:opacity-50 ${
                  program.visibility === 'public'
                    ? 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100'
                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${program.visibility === 'public' ? 'bg-sky-500' : 'bg-slate-400'}`} />
                {program.visibility === 'public' ? 'Public' : 'Private'}
              </button>
            </div>
            {program.description
              ? (/<[a-z][\s\S]*>/i.test(program.description)
                  ? <div className="prose prose-sm max-w-none dark:prose-invert text-slate-600 dark:text-slate-300 mb-4" dangerouslySetInnerHTML={{ __html: program.description }} />
                  : <p className="text-slate-600 mb-4 whitespace-pre-wrap">{program.description}</p>)
              : <p className="text-slate-600 mb-4">No description available</p>}
            {program.tags && program.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {program.tags.map((tag: string, idx: number) => (
                  <span key={idx} className="px-3 py-1 bg-brand-50 text-brand-700 rounded-lg text-sm">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 items-center">
            {/* Edit Button */}
            <button
              onClick={() => setEditOpen(true)}
              className="px-4 py-2 bg-card hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition-colors flex items-center gap-2"
            >
              <Pencil className="w-4 h-4" />
              Edit
            </button>

            {/* Share Button */}
            <div className="relative" ref={shareRef}>
              <button
                onClick={() => setShareOpen(!shareOpen)}
                className="px-4 py-2 bg-card hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition-colors flex items-center gap-2"
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>

              {shareOpen && (
                <MenuPanel align="end" width="w-64">
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                    <p className="text-sm font-medium text-slate-700">Share Program</p>
                    <p className="text-xs text-slate-500 mt-0.5">Copy a link to share this program</p>
                  </div>
                  <div className="p-2">
                    <button
                      onClick={() => copyToClipboard(
                        `${window.location.origin}/mentor/programs/${id}`,
                        'Mentor program link'
                      )}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 text-left transition-colors"
                    >
                      <div className="w-8 h-8 bg-brand-100 rounded-lg flex items-center justify-center shrink-0">
                        <LinkIcon className="w-4 h-4 text-brand-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700">Mentor Program Link</p>
                        <p className="text-xs text-slate-500">Share with assigned mentors</p>
                      </div>
                    </button>
                  </div>
                </MenuPanel>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Link href={enrollmentsHref} className="group bg-card rounded-2xl p-6 border border-slate-200 transition-colors hover:border-brand-300">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-brand-600" />
            </div>
            <span className="text-slate-600 text-sm">Enrollments</span>
            <ArrowUpRight className="ml-auto h-4 w-4 text-slate-300 transition-colors group-hover:text-brand-600" aria-hidden />
          </div>
          <div className="text-slate-900 text-2xl">{program._count?.enrollments ?? 0}</div>
        </Link>

        <div className="bg-card rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-purple-600" />
            </div>
            <span className="text-slate-600 text-sm">Mentors</span>
          </div>
          <div className="text-slate-900 text-2xl">{program._count?.mentors ?? 0}</div>
        </div>

        <div className="bg-card rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <span className="text-slate-600 text-sm">Completion</span>
          </div>
          <div className="text-slate-900 text-2xl">{program.completion || 0}%</div>
        </div>

        <div className="bg-card rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-slate-600 text-sm">Duration (Weeks)</span>
          </div>
          <div className="text-slate-900 text-2xl">{program.totalDurationWeeks || 'N/A'}</div>
        </div>
      </div>

      {/*
          Enrollments is a link, not a tab.

          It used to render its own list here — the first twenty rows of a
          programme with 1,088 enrolments, under a heading that called them
          "All Enrollments (20)". No search, no status filter, no paging, no
          export, and no way to act on anybody: a worse copy of a screen that
          already exists and does all of that. So it hands over to that screen
          with this programme already chosen.
      */}
      <div className="mb-6 border-b border-slate-200">
        <div className="flex items-center gap-6">
          <span className="border-b-2 border-brand-600 pb-3 text-brand-600">Overview</span>
          <Link
            href={enrollmentsHref}
            className="group inline-flex items-center gap-1.5 border-b-2 border-transparent pb-3 text-slate-600 transition-colors hover:text-slate-900"
          >
            Enrollments
            {typeof program._count?.enrollments === 'number' && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs tabular-nums text-slate-500">
                {program._count.enrollments.toLocaleString()}
              </span>
            )}
            <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden />
          </Link>
        </div>
      </div>

      {/* Tab Content */}
      {(
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-card rounded-2xl p-6 border border-slate-200">
              <h2 className="text-slate-900 mb-4">Program Information</h2>
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-slate-600 text-sm mb-1">Type</div>
                    <div className="text-slate-900">{program.type}</div>
                  </div>
                  <div>
                    <div className="text-slate-600 text-sm mb-1">Hours Per Week</div>
                    <div className="text-slate-900">{program.estimatedHoursPerWeek}</div>
                  </div>
                  <div>
                    <div className="text-slate-600 text-sm mb-1">Start Date</div>
                    <div className="text-slate-900">{program.startDate ? new Date(program.startDate).toLocaleDateString() : new Date(program.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <div className="text-slate-600 text-sm mb-1">End Date</div>
                    <div className="text-slate-900">{program.endDate ? new Date(program.endDate).toLocaleDateString() : 'Ongoing'}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-2xl p-6 border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-slate-900">Curriculum</h2>
                <Link
                  href="/admin/roadmaps"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm transition-colors"
                >
                  <Route className="w-4 h-4" />
                  Author roadmaps
                </Link>
              </div>
              <p className="text-slate-600 text-sm">
                Curriculum is authored as <span className="font-medium">linear roadmaps</span> in the Roadmaps area;
                mentors import &amp; assign them to mentees. Mentors are matched to mentees directly via clans.
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-card rounded-2xl p-6 border border-slate-200">
              <h3 className="text-slate-900 mb-2">Enrollments</h3>
              <p className="text-slate-600 text-sm">
                Review and approve mentee enrollment requests in the <span className="font-medium">Enrollments</span> tab.
              </p>
            </div>
          </div>
        </div>
      )}

      {editOpen && (
        <EditProgramDrawer
          program={program}
          onClose={() => setEditOpen(false)}
          onSaved={refetch}
        />
      )}
    </>
  );
}
