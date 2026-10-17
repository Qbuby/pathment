"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, BellRing } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/services/api-client";
import { Drawer } from "@/components/shared/Drawer";
import { extractApiErrorMessage } from "@/lib/utils/api-error";
import { useClanHealth } from "@/lib/hooks/admin/useClanHealth";
import { useDebounce } from "@/lib/hooks/shared/useDebounce";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { Avatar } from "@/components/shared/Avatar";
import { PageHeader } from "@/components/admin/ui";

interface FollowUpPage {
  rows: {
    id: string;
    name: string;
    avatarUrl?: string;
    risk: string;
    riskReason: string;
    absoluteProgress: number;
    clans: { id: string; name: string }[];
  }[];
  total: number;
  page: number;
  pages: number;
  generatedAt: string;
}
function FollowUps() {
  const params = useSearchParams();
  const { can } = usePermissions();
  const { programs } = useClanHealth();
  const [risk, setRisk] = useState(
    ["high", "watch"].includes(params.get("risk") || "")
      ? params.get("risk")!
      : "",
  );
  const [clanId, setClanId] = useState(params.get("clanId") || "");
  const [search, setSearch] = useState("");
  const query = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<FollowUpPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  /**
   * The page named thirty people who needed chasing and offered no way to
   * chase one of them — it was a table and a paginator. Nudging is the action
   * the queue exists for, so it belongs on the queue.
   */
  const [nudging, setNudging] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const canNudge = can("mentee.manage");
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    apiClient
      .get<{ data: FollowUpPage }>("/clans/follow-ups", {
        params: {
          page,
          limit: 20,
          risk: risk || undefined,
          clanId: clanId || undefined,
          search: query || undefined,
        },
      })
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch(() => {
        if (!cancelled)
          setError("Could not load follow-ups. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, risk, clanId, query, retry]);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Mentee follow-ups"
        subtitle="A focused queue for coordinating support with clan mentors. High priority first, then lowest completion. Snapshots are cached for 30 seconds; refresh to check for updates."
      />
      {canNudge && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50/50 px-4 py-3 dark:border-brand-500/20 dark:bg-brand-500/5">
          <p className="text-sm text-muted-foreground">
            {data?.total
              ? <>Nudge the <strong className="text-foreground">{data.total.toLocaleString()}</strong> {data.total === 1 ? "mentee" : "mentees"} matching these filters — not just this page.</>
              : "Nobody matches these filters right now."}
          </p>
          <button
            type="button"
            disabled={!data?.total}
            onClick={() => { setNote(""); setNudging(true); }}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
          >
            <BellRing className="h-4 w-4" aria-hidden />
            Nudge {data?.total ? data.total.toLocaleString() : "all"}
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-3 rounded-2xl border bg-card p-4">
        <input
          aria-label="Search follow-ups"
          placeholder="Search name or email…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          className="min-w-48 flex-1 rounded-xl border bg-card px-3 py-2"
        />
        <select
          aria-label="Priority"
          value={risk}
          onChange={(event) => {
            setRisk(event.target.value);
            setPage(1);
          }}
          className="rounded-xl border bg-card px-3 py-2"
        >
          <option value="">All flagged mentees</option>
          <option value="high">High priority</option>
          <option value="watch">Needs follow-up</option>
        </select>
        <select
          aria-label="Clan"
          value={clanId}
          onChange={(event) => {
            setClanId(event.target.value);
            setPage(1);
          }}
          className="max-w-full rounded-xl border bg-card px-3 py-2"
        >
          <option value="">All clans</option>
          {programs.map((program) => (
            <optgroup key={program.id} label={program.name}>
              {program.clans.map((clan) => (
                <option key={clan.id} value={clan.id}>
                  {clan.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          onClick={() => setRetry((value) => value + 1)}
          disabled={loading}
          className="rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          Refresh
        </button>
      </div>
      {error ? (
        <div role="alert" className="rounded-2xl border bg-card p-6">
          {error}
          <button
            onClick={() => setRetry((value) => value + 1)}
            className="ml-3 text-brand-700"
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <div role="status" className="flex justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="sr-only">Loading follow-ups</span>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border bg-card">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <caption>
                {data?.total.toLocaleString() ?? 0} {data?.total === 1 ? "mentee matches" : "mentees match"} · 20 per page
              </caption>
              <thead>
                <tr>
                  <th>Mentee</th>
                  <th>Priority & reason</th>
                  <th>Clan</th>
                  <th>Completion</th>
                </tr>
              </thead>
              <tbody>
                {data?.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={row.name} src={row.avatarUrl} size="sm" />
                        {can("user.manage") ? (
                          <Link
                            className="font-semibold hover:underline"
                            href={`/admin/mentees/${row.id}`}
                          >
                            {row.name}
                          </Link>
                        ) : (
                          row.name
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`text-xs font-semibold ${row.risk === "high" ? "text-rose-600 dark:text-rose-300" : "text-amber-700 dark:text-amber-300"}`}
                      >
                        {row.risk === "high"
                          ? "High priority"
                          : "Needs follow-up"}
                      </span>
                      <p className="mt-1 max-w-md text-xs text-muted-foreground">
                        {row.riskReason}
                      </p>
                    </td>
                    <td>
                      {row.clans.map((clan) => (
                        <div key={clan.id}>
                          {can("clan.create") ? (
                            <Link
                              className="hover:underline"
                              href={`/admin/clans?clan=${clan.id}`}
                            >
                              {clan.name}
                            </Link>
                          ) : (
                            clan.name
                          )}
                        </div>
                      ))}
                    </td>
                    <td className="tabular-nums">{row.absoluteProgress}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data?.rows.length && (
            <p className="p-10 text-center text-muted-foreground">
              No mentees match these filters.
            </p>
          )}
          <div className="flex items-center justify-between border-t p-4 text-sm">
            <span>
              Page {data?.page ?? 1} of {data?.pages ?? 1}
            </span>
            <div className="flex gap-2">
              <button
                disabled={!data || data.page <= 1}
                onClick={() => setPage((data?.page ?? 1) - 1)}
                className="rounded-lg border px-3 py-2 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={!data || data.page >= data.pages}
                onClick={() => setPage((data?.page ?? 1) + 1)}
                className="rounded-lg border px-3 py-2 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/*
          A confirmation with the count in it, because this is a notification
          per person and there is no unsend. The message is optional: the
          server writes a sensible default rather than sending an empty one.
      */}
      <Drawer
        open={nudging}
        onClose={() => setNudging(false)}
        title="Nudge these mentees"
        subtitle={data?.total
          ? `${data.total.toLocaleString()} ${data.total === 1 ? "person" : "people"} match the filters on this page`
          : undefined}
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setNudging(false)}
              className="rounded-lg border px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={async () => {
                setSending(true);
                try {
                  const res = await apiClient.post<{ message: string; data: { sent: number; skipped: number; capped: boolean } }>(
                    "/clans/follow-ups/nudge",
                    { risk: risk || undefined, clanId: clanId || undefined, search: query || undefined, message: note.trim() || undefined },
                  );
                  const { sent, skipped, capped } = res.data;
                  toast.success(
                    `Nudged ${sent} ${sent === 1 ? "mentee" : "mentees"}`,
                    { description: [
                      skipped ? `${skipped} skipped (closed or frozen clans)` : null,
                      capped ? "Capped at 200 — narrow the filters and run it again for the rest" : null,
                    ].filter(Boolean).join(" · ") || undefined },
                  );
                  setNudging(false);
                } catch (e) {
                  toast.error(extractApiErrorMessage(e, "Could not send the nudges"));
                } finally {
                  setSending(false);
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}
              Send {data?.total ? data.total.toLocaleString() : ""} {data?.total === 1 ? "nudge" : "nudges"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Each person gets one in-app notification. It goes to everyone the current filters match,
            not only the page you can see, and mentees in a closed or frozen clan are skipped.
          </p>
          <div>
            <label htmlFor="nudge-note" className="mb-1.5 block text-sm font-medium">
              Message <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="nudge-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Leave this empty and each person gets a friendly check-in in their own name."
              className="w-full rounded-xl border bg-card px-3.5 py-2.5 text-sm"
            />
          </div>
        </div>
      </Drawer>
    </div>
  );
}
export default function FollowUpsPage() {
  return (
    <Suspense>
      <FollowUps />
    </Suspense>
  );
}
