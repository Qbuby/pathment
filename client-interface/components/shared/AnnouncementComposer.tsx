'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { announcementsApi, type AnnouncementAudience } from '@/lib/services/announcements-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

/**
 * Writing an announcement — one composer for both portals.
 *
 * Admin and mentor each had their own copy: a raw `<details>` holding a form
 * built from native `<select>`s, which is neither the drawer this codebase uses
 * for "ask the user something" nor the `SelectMenu` it uses for choices. Two
 * copies also meant two chances to get the audience rules wrong. The rules are
 * the server's; this just offers what the caller is allowed to pick.
 */

export interface AudienceTarget { id: string; name: string }

export interface AnnouncementComposerProps {
  open: boolean;
  onClose: () => void;
  /** Refetch the feed after a successful post. */
  onPosted: () => void;
  /**
   * Audiences this person may broadcast to. Admins get the full set; a mentor
   * gets `clan` only, because that is all the server will accept from them.
   */
  audiences: AnnouncementAudience[];
  programs?: AudienceTarget[];
  clans?: AudienceTarget[];
}

const AUDIENCE_LABEL: Record<AnnouncementAudience, { label: string; description: string }> = {
  all: { label: 'Everyone', description: 'Every member of the workspace' },
  mentors: { label: 'All mentors', description: 'Everyone who mentors a clan' },
  mentees: { label: 'All mentees', description: 'Everyone working a roadmap' },
  program: { label: 'A program', description: 'Everyone enrolled in one program' },
  clan: { label: 'A clan', description: 'One clan and its mentors' },
};

export function AnnouncementComposer({
  open, onClose, onPosted, audiences, programs = [], clans = [],
}: AnnouncementComposerProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>(audiences[0] ?? 'all');
  const [targetId, setTargetId] = useState('');
  const [posting, setPosting] = useState(false);

  // Reopening after a post should offer a blank form, not the last one.
  useEffect(() => {
    if (!open) return;
    setTitle(''); setBody(''); setTargetId('');
    setAudience(audiences[0] ?? 'all');
  }, [open, audiences]);

  const needsTarget = audience === 'program' || audience === 'clan';
  const targets = audience === 'program' ? programs : clans;

  // A mentor who leads exactly one clan should not have to pick it.
  useEffect(() => {
    if (needsTarget && !targetId && targets.length === 1) setTargetId(targets[0].id);
  }, [needsTarget, targetId, targets]);

  const audienceOptions = useMemo(
    () => audiences.map((value) => ({ value, ...AUDIENCE_LABEL[value] })),
    [audiences],
  );

  const post = async () => {
    if (!title.trim() || !body.trim()) { toast.error('Add a title and a message'); return; }
    if (needsTarget && !targetId) { toast.error(`Select a ${audience}`); return; }
    try {
      setPosting(true);
      await announcementsApi.create({
        title: title.trim(),
        body: body.trim(),
        audience,
        audienceId: needsTarget ? targetId : undefined,
      });
      toast.success('Announcement posted');
      onPosted();
      onClose();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not post the announcement'));
    } finally {
      setPosting(false);
    }
  };

  const fieldClass =
    'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Write an announcement"
      subtitle="It appears in the feed of everyone in the audience you choose."
      width="md"
      footer={(dismiss) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={dismiss}
            disabled={posting}
            className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={post}
            disabled={posting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Post
          </button>
        </div>
      )}
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="announcement-title" className="text-sm font-medium text-foreground">
            Title
          </label>
          <input
            id="announcement-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Downtime on Saturday evening"
            className={fieldClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="announcement-body" className="text-sm font-medium text-foreground">
            Message
          </label>
          <textarea
            id="announcement-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder="What do people need to know?"
            className={`${fieldClass} resize-y leading-7`}
          />
          <p className="text-xs text-muted-foreground">Links are made clickable automatically.</p>
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Audience</span>
          {audienceOptions.length > 1 ? (
            <SelectMenu
              value={audience}
              onChange={(value) => { setAudience(value as AnnouncementAudience); setTargetId(''); }}
              options={audienceOptions}
              ariaLabel="Audience"
              className="w-full"
            />
          ) : (
            <p className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
              {AUDIENCE_LABEL[audience].label} — {AUDIENCE_LABEL[audience].description}
            </p>
          )}
        </div>

        {needsTarget && (
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              Which {audience}?
            </span>
            {targets.length === 0 ? (
              <p className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                You have no {audience} to announce to.
              </p>
            ) : (
              <SelectMenu
                value={targetId}
                onChange={setTargetId}
                options={targets.map((t) => ({ value: t.id, label: t.name }))}
                placeholder={`Select a ${audience}…`}
                ariaLabel={`Target ${audience}`}
                className="w-full"
              />
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}
