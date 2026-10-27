'use client';

import { useMemo, useRef, useState } from 'react';
import {
  KeyRound, FileText, Sparkles, UploadCloud, Loader2, CheckCircle2, Circle,
  AlertCircle, Trash2, ExternalLink, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Drawer } from '@/components/shared/Drawer';
import { useAutoReply } from '@/lib/hooks/mentor/useAutoReply';
import { useDocumentsTab } from '@/lib/hooks/mentor';
import { useAIConnections } from '@/lib/hooks/shared/useAIConnections';
import { aiConnectionsApi } from '@/lib/services/ai-connections-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { workspacePath } from '@/lib/services/workspace-scope';
import type { SetupStep } from '@/lib/services/auto-reply-api';

/**
 * Setting reply assistance up, in the place it is used.
 *
 * The server has always known exactly what is missing - `GET /auto-reply`
 * returns the three steps with why each one matters - but the only way to ACT
 * on any of them was to leave the conversation and visit three different
 * screens: Settings then AI connections for the key, Settings then Reply
 * assistance for the documents, and a toggle that stays greyed out until both
 * are done. A mentor sitting in a chat looking at "No pending drafts" was given
 * no reason and no way forward, so in practice nobody finished it.
 *
 * Same checklist, same server contract, rendered where the feature lives and
 * with each step completable without navigating away.
 */

const STEP_ICON: Record<SetupStep['key'], typeof KeyRound> = {
  key: KeyRound,
  documents: FileText,
  style: Sparkles,
};

function StepShell({
  step, index, children,
}: { step: SetupStep; index: number; children?: React.ReactNode }) {
  const Icon = STEP_ICON[step.key] || Circle;
  const pct = step.progress && step.progress.needed > 0
    ? Math.min(100, Math.round((step.progress.current / step.progress.needed) * 100))
    : null;

  return (
    <section
      className={`rounded-2xl border p-4 transition-colors ${
        step.done ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-card'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            step.done ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'
          }`}
        >
          {step.done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              {index}. {step.title}
            </h3>
            {!step.blocking && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Optional
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.why}</p>

          {pct !== null && (
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${step.done ? 'bg-emerald-500' : 'bg-brand-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                {step.progress!.current} of {step.progress!.needed}
              </p>
            </div>
          )}

          {children ? <div className="mt-3">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}

function KeyStep({ step, index, onConnected }: { step: SetupStep; index: number; onConnected: () => void }) {
  const { connections, routing, refetch } = useAIConnections();
  const [label, setLabel] = useState('Gemini');
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);

  const geminiKeys = useMemo(
    // 'error' is a key that failed its own test. Counting it would promise a
    // draft that can never be written.
    () => connections.filter((c) => c.provider === 'gemini' && c.status !== 'error'),
    [connections],
  );
  /**
   * Keys they already have that cannot do this job.
   *
   * Without naming them, this step reads as a flat contradiction: AI
   * connections shows two keys marked Connected, and this says there is no
   * key. Both are true - embeddings are Gemini-only and neither key is
   * Gemini - but nothing on either screen said so, so the only reasonable
   * conclusion was that one of them was broken.
   */
  const otherKeys = useMemo(
    () => connections.filter((c) => c.provider !== 'gemini'),
    [connections],
  );
  /**
   * Having a key and having it DO anything are different questions.
   *
   * Embeddings are the one that must point at a Gemini key specifically, so
   * that is what is checked: generation and grounding are happy on any
   * provider and may legitimately be pointed elsewhere.
   */
  const embeddingRoutedToGemini = geminiKeys.some((c) => c.id === routing.rag_embedding);
  const unrouted = geminiKeys.length > 0 && !embeddingRoutedToGemini;

  /**
   * Connecting the key and pointing it at the feature, in one step.
   *
   * Adding a key is not enough on its own: `ragOrchestrator` resolves its
   * model through feature ROUTING and returns nothing when it finds none,
   * logging "no generation key routed to rag_generation" where nobody looks.
   * Doing both here is the difference between a key that exists and a key
   * that works.
   */
  const connect = async () => {
    if (!key.trim()) { toast.error('Paste the key first'); return; }
    setSaving(true);
    try {
      const res = await aiConnectionsApi.create({
        provider: 'gemini',
        label: label.trim() || 'Gemini',
        key: key.trim(),
      }) as { data?: { connection?: { id: string } } };
      const created = res?.data?.connection;
      if (created?.id) {
        /**
         * Embeddings move to the new key unconditionally - only Gemini can
         * generate them, so whatever was there was not working.
         *
         * Generation and grounding run on any provider, so a choice already
         * made is left alone: somebody who deliberately points drafting at
         * their OpenRouter key should not have it silently reassigned because
         * they added a key for embeddings. Only the empty ones are filled.
         */
        await aiConnectionsApi.setRouting({
          ...routing,
          rag_generation: routing.rag_generation || created.id,
          rag_grounding: routing.rag_grounding || created.id,
          rag_embedding: created.id,
        });
      }
      setKey('');
      await refetch();
      onConnected();
      toast.success('Connected, and pointed at reply assistance');
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Could not connect that key'));
    } finally {
      setSaving(false);
    }
  };

  const route = async () => {
    const id = geminiKeys[0]?.id;
    if (!id) return;
    setSaving(true);
    try {
      await aiConnectionsApi.setRouting({
        ...routing,
        rag_generation: routing.rag_generation || id,
        rag_grounding: routing.rag_grounding || id,
        rag_embedding: id,
      });
      await refetch();
      onConnected();
      toast.success('Pointed at reply assistance');
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Could not update routing'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <StepShell step={step} index={index}>
      {step.done && !unrouted ? (
        <p className="text-xs text-muted-foreground">
          Using <span className="font-medium text-foreground">{geminiKeys[0]?.label || 'your Gemini key'}</span>.
          {' '}
          <Link href={workspacePath('/mentor/settings?section=ai')} className="font-medium text-brand-600 hover:underline">
            Manage keys
          </Link>
        </p>
      ) : step.done && unrouted ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-xs text-foreground">
            The key is connected but nothing is pointed at reply assistance yet, so no draft would ever
            be written. One click fixes it.
          </p>
          <button
            type="button"
            onClick={route}
            disabled={saving}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Use it for reply assistance
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {otherKeys.length > 0 && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-foreground">
              You have {otherKeys.length === 1 ? 'a key' : `${otherKeys.length} keys`} connected
              ({otherKeys.map((c) => c.provider).join(', ')}), and {otherKeys.length === 1 ? 'it is' : 'none is'} Gemini.
              Reply assistance searches your material with embeddings, which only Gemini can generate,
              so it needs a Gemini key of its own. Your other keys keep doing what they already do.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Name it"
              aria-label="Key name"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500 sm:w-32"
            />
            <input
              value={key}
              onChange={(event) => setKey(event.target.value)}
              type="password"
              placeholder="Paste your Gemini API key"
              aria-label="Gemini API key"
              autoComplete="off"
              className="w-full flex-1 rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs text-foreground placeholder:font-sans placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={connect}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Connect
            </button>
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:underline"
            >
              Get a free key <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Stored encrypted and only ever shown masked. The usage is billed to you, not to Pathment.
          </p>
        </div>
      )}
    </StepShell>
  );
}

function DocumentsStep({
  step, index, documents, uploading, uploadFile, onDelete, deletingId,
}: {
  step: SetupStep;
  index: number;
  documents: Array<{ id: string; fileName: string; status: string; errorMessage?: string }>;
  uploading: boolean;
  uploadFile: (file: File) => Promise<boolean>;
  onDelete: (id: string) => void;
  deletingId: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const take = async (file?: File | null) => {
    if (!file) return;
    const ok = await uploadFile(file);
    if (ok && inputRef.current) inputRef.current.value = '';
  };

  return (
    <StepShell step={step} index={index}>
      <div
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); void take(event.dataTransfer.files?.[0]); }}
        className={`rounded-xl border border-dashed p-4 text-center transition-colors ${
          dragging ? 'border-brand-500 bg-brand-500/5' : 'border-border'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="sr-only"
          onChange={(event) => void take(event.target.files?.[0])}
        />
        <UploadCloud className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="mt-1.5 text-xs font-semibold text-brand-600 hover:underline disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : 'Choose a PDF'}
        </button>
        <p className="mt-0.5 text-[11px] text-muted-foreground">or drop one here</p>
      </div>

      {documents.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {documents.map((document) => (
            <li
              key={document.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5"
            >
              {document.status === 'processing' ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
              ) : document.status === 'failed' ? (
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              )}
              <span className="min-w-0 flex-1 truncate text-[11px] text-foreground" title={document.fileName}>
                {document.fileName}
              </span>
              {document.status === 'failed' && document.errorMessage && (
                <span className="truncate text-[10px] text-red-500" title={document.errorMessage}>
                  {document.errorMessage}
                </span>
              )}
              <button
                type="button"
                onClick={() => onDelete(document.id)}
                disabled={deletingId === document.id}
                aria-label={`Remove ${document.fileName}`}
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-red-600 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </StepShell>
  );
}

export function ReplyAssistantDrawer({
  open, onClose, role = 'mentor',
}: { open: boolean; onClose: () => void; role?: 'mentor' | 'admin' }) {
  const { status, refetch: refetchStatus, setEnabled } = useAutoReply();
  const {
    documents, uploading, uploadFile, deleteDocumentId, setDeleteDocumentId, handleDeleteConfirm, deleting,
    refetchDocuments,
  } = useDocumentsTab();
  const [toggling, setToggling] = useState(false);

  /**
   * An admin sees the key step and nothing else.
   *
   * The other two are each mentor's own - their material, their writing - and
   * an admin who does not mentor has neither.
   *
   * The key they add is the workspace's, and it is worth being exact about
   * what that does: `aiConnectionService` enforces a strict BYOK rule and
   * returns null for a mentor with no personal key rather than falling back to
   * an org one, so a workspace key does NOT get mentors past step one. It
   * powers the admin-side AI features. Saying otherwise would send an admin
   * away believing they had solved something for everybody.
   */
  const allSteps = status?.steps ?? [];
  const steps = role === 'admin' ? allSteps.filter((step) => step.key === 'key') : allSteps;
  const canEnable = status?.canEnable ?? false;
  const enabled = status?.enabled ?? false;

  const afterStep = async () => {
    await Promise.all([refetchStatus(), refetchDocuments()]);
  };

  const toggle = async () => {
    setToggling(true);
    try {
      await setEnabled(!enabled);
      toast.success(!enabled ? 'Reply assistance is on' : 'Reply assistance is off');
    } catch (error) {
      // The server refuses with the reason, and its reason is the real one.
      toast.error(extractApiErrorMessage(error, 'Could not change that'));
      await refetchStatus();
    } finally {
      setToggling(false);
    }
  };

  const remove = async (id: string) => {
    setDeleteDocumentId(id);
    await handleDeleteConfirm();
    await afterStep();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={role === 'admin' ? 'Reply assistance for your mentors' : 'Set up reply assistance'}
      subtitle={role === 'admin'
        ? 'The workspace key for admin-side AI. Mentors each bring their own for reply assistance.'
        : 'Drafts in your own words, grounded in your own material. Nothing is sent without you.'}
      footer={role === 'admin' ? (
        <p className="text-[11px] text-muted-foreground">
          Each mentor connects their own key, adds their own material and turns it on for themselves.
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            {canEnable
              ? 'Ready. Drafts appear in the conversation as mentees write to you.'
              : 'Finish the steps above to switch this on.'}
          </p>
          <button
            type="button"
            onClick={toggle}
            disabled={toggling || (!enabled && !canEnable)}
            title={!enabled && !canEnable ? 'Finish the steps above first' : undefined}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              enabled
                ? 'border border-border bg-card text-foreground hover:bg-muted'
                : 'bg-brand-600 text-white hover:bg-brand-700'
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {toggling && <Loader2 className="h-4 w-4 animate-spin" />}
            {enabled ? 'Turn off' : 'Turn on'}
          </button>
        </div>
      )}
    >
      <div className="space-y-3">
        {role === 'admin' && (
          <div className="flex gap-2 rounded-xl border border-border bg-muted/40 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-xs leading-5 text-muted-foreground">
              A key you add here belongs to the whole workspace and powers the admin-side AI features.
              It does <span className="font-medium text-foreground">not</span> cover reply assistance:
              that is strictly bring-your-own-key, so each mentor adds their own and the usage is
              billed to them.
            </p>
          </div>
        )}

        {steps.length === 0 ? (
          <div className="flex items-center gap-2 px-1 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking what is set up…
          </div>
        ) : (
          steps.map((step, position) => {
            const index = position + 1;
            if (step.key === 'key') {
              return <KeyStep key={step.key} step={step} index={index} onConnected={afterStep} />;
            }
            if (step.key === 'documents') {
              return (
                <DocumentsStep
                  key={step.key}
                  step={step}
                  index={index}
                  documents={documents}
                  uploading={uploading}
                  uploadFile={async (file) => { const ok = await uploadFile(file); if (ok) await afterStep(); return ok; }}
                  onDelete={remove}
                  deletingId={deleting ? deleteDocumentId : null}
                />
              );
            }
            return <StepShell key={step.key} step={step} index={index} />;
          })
        )}

        {status?.usage && role !== 'admin' ? (
          <p className="px-1 text-[11px] text-muted-foreground tabular-nums">
            {status.usage.sent} of {status.usage.limit} assisted replies used this month.
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}

export default ReplyAssistantDrawer;
