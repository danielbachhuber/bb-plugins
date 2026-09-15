import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  definePluginApp,
  useRealtime,
  useRpc,
  type NewThreadRequest,
} from '@get-bb/plugin-sdk/app';
import { toast } from 'sonner';

import { StartThreadDialog, type StartThreadSeed } from '@/components/start-thread-dialog';
import { Button } from '@/components/ui/button';
import { EmptyGraphic } from '@/components/ui/empty-graphic';
import { Icon } from '@/components/ui/icon';
import { LoadingGraphic } from '@/components/ui/loading-graphic';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SyncStatus } from '@/components/ui/sync-status';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { TitleLink } from '@/components/ui/title-link';

type SuggestedAction = 'close' | 'comment' | 'keep' | 'needsInfo';

interface Row {
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  milestone: string | null;
  labels: string[];
  staleness: {
    ageDays: number;
    idleDays: number;
    emptyBody: boolean;
    commentCount: number;
    hasType: boolean;
    hasLabels: boolean;
    hasMilestone: boolean;
    assigned: boolean;
    score: number;
  };
  suggestion: {
    action: SuggestedAction;
    body: string;
    rationale: string;
    suggestedAt: string;
    threadId: string | null;
  } | null;
  disposition: {
    verdict: 'pending' | 'approved' | 'rejected';
    rejectionReason: string;
    approvedBody: string;
    decidedAt: string | null;
    appliedAt: string | null;
    applyError: string | null;
  };
}

interface Listing {
  repo: string;
  rows: Row[];
  sweptAt: number | null;
  total: number;
  truncated: boolean;
  lastError: string | null;
  counts: { pending: number; researched: number; approved: number; rejected: number };
  batchSize: number;
}

const ACTION_LABEL: Record<SuggestedAction, string> = {
  close: 'Close',
  comment: 'Comment',
  keep: 'Keep',
  needsInfo: 'Needs info',
};

/** Which actions write to GitHub, mirroring `actionPostsComment` on the server. */
function postsComment(action: SuggestedAction): boolean {
  return action === 'close' || action === 'comment';
}

const BADGE = 'rounded-md px-1.5 py-0.5 text-xs font-medium';

function ActionBadge({ action }: { action: SuggestedAction }) {
  const tone =
    action === 'close'
      ? 'bg-destructive/10 text-destructive'
      : action === 'keep'
        ? 'bg-muted text-muted-foreground'
        : 'bg-primary/10 text-primary';
  return <span className={`${BADGE} ${tone}`}>{ACTION_LABEL[action]}</span>;
}

/** The evidence the sweep derived, as one muted line. */
function stalenessLine(row: Row): string {
  const s = row.staleness;
  const parts = [`${s.idleDays}d idle`, `${s.ageDays}d old`, `@${row.author}`];
  if (s.emptyBody) parts.push('empty body');
  if (s.commentCount === 0) parts.push('no comments');
  else parts.push(`${s.commentCount} comment${s.commentCount === 1 ? '' : 's'}`);
  if (!s.hasType) parts.push('no type');
  if (!s.hasMilestone) parts.push('no milestone');
  if (s.assigned) parts.push('assigned');
  return parts.join(' · ');
}

/**
 * The panel and the header each call this. They hold separate state, so the
 * selected repo is read from the server rather than lifted into a parent both
 * would have to share.
 */
function useListing() {
  const rpc = useRpc();
  const [repo, setRepo] = useState<string | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);

  const load = useCallback(async () => {
    const selection = (await rpc.call('selectedRepo', null)) as { repo: string | null };
    setRepo(selection.repo);
    if (!selection.repo) {
      setListing(null);
      return;
    }
    setListing((await rpc.call('listRows', { repo: selection.repo })) as Listing);
  }, [rpc]);

  const select = useCallback(
    async (next: string | null) => {
      await rpc.call('selectRepo', { repo: next });
      await load();
    },
    [load, rpc],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useRealtime('triage-updated', () => {
    void load();
  });

  return { repo, listing, reload: load, select, rpc };
}

function RepoPicker({ value, onChange }: { value: string | null; onChange: (repo: string) => void }) {
  const rpc = useRpc();
  const [options, setOptions] = useState<{ swept: string[]; candidates: string[] }>({ swept: [], candidates: [] });

  useEffect(() => {
    void (async () => {
      const result = (await rpc.call('listRepos', null)) as {
        swept: string[];
        candidates: string[];
        error: string | null;
      };
      setOptions({ swept: result.swept, candidates: result.candidates });
      if (result.error) toast.error(`Could not list repositories: ${result.error}`);
    })();
  }, [rpc]);

  const all = useMemo(() => {
    const seen = new Set<string>();
    return [...options.swept, ...options.candidates].filter((r) => (seen.has(r) ? false : (seen.add(r), true)));
  }, [options]);

  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger className="w-[260px] cursor-pointer">
        <SelectValue placeholder="Pick a repository" />
      </SelectTrigger>
      <SelectContent>
        {all.map((repo) => (
          <SelectItem key={repo} value={repo}>
            {repo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * One issue. The draft body and the rejection reason are local state seeded
 * from the server, so an edit survives a background re-sweep and is only sent
 * when a decision is actually made.
 */
function TriageRowView({ row, onDone }: { row: Row; onDone: () => void }) {
  const rpc = useRpc();
  const suggestion = row.suggestion;
  const [body, setBody] = useState(row.disposition.approvedBody || suggestion?.body || '');
  const [reason, setReason] = useState(row.disposition.rejectionReason);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    setBody(row.disposition.approvedBody || row.suggestion?.body || '');
  }, [row.disposition.approvedBody, row.suggestion?.body]);

  const decided = row.disposition.verdict !== 'pending';

  async function approve() {
    setBusy(true);
    const result = (await rpc.call('approve', { repo: row.repo, number: row.number, body })) as {
      ok: boolean;
      error: string | null;
    };
    setBusy(false);
    if (result.ok) toast.success(`#${row.number} ${suggestion ? ACTION_LABEL[suggestion.action].toLowerCase() : 'approved'}d`);
    else toast.error(result.error ?? 'Could not apply that.');
    onDone();
  }

  async function reject() {
    if (reason.trim().length === 0) {
      toast.error('A rejection reason is required.');
      return;
    }
    setBusy(true);
    const result = (await rpc.call('reject', { repo: row.repo, number: row.number, reason })) as {
      ok: boolean;
      error: string | null;
    };
    setBusy(false);
    if (result.ok) {
      setRejecting(false);
      toast.success(`#${row.number} rejected`);
    } else {
      toast.error(result.error ?? 'Could not record that.');
    }
    onDone();
  }

  return (
    <TableRow>
      <TableCell className="px-3 py-3 align-top">
        <TitleLink href={row.url} text={`#${row.number} ${row.title}`} />
        <div className="mt-1 text-xs text-muted-foreground break-words">{stalenessLine(row)}</div>
      </TableCell>

      <TableCell className="px-3 py-3 align-top w-[110px]">
        {suggestion ? <ActionBadge action={suggestion.action} /> : <span className="text-xs text-muted-foreground">—</span>}
      </TableCell>

      <TableCell className="px-3 py-3 align-top">
        {!suggestion && <div className="text-xs text-muted-foreground">Not researched yet.</div>}

        {suggestion && (
          <div className="space-y-2">
            {suggestion.rationale && <div className="text-xs text-muted-foreground break-words">{suggestion.rationale}</div>}

            {postsComment(suggestion.action) && (
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={decided || busy}
                rows={5}
                className="text-sm"
                aria-label={`Draft comment for issue ${row.number}`}
              />
            )}

            {row.disposition.applyError && (
              <div className="text-xs text-destructive break-words">Could not apply: {row.disposition.applyError}</div>
            )}

            {row.disposition.verdict === 'approved' && (
              <div className="text-xs text-muted-foreground">
                Approved{row.disposition.appliedAt ? ` and applied` : ''}.
              </div>
            )}

            {row.disposition.verdict === 'rejected' && (
              <div className="text-xs text-muted-foreground break-words">Rejected: {row.disposition.rejectionReason}</div>
            )}

            {!decided && (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={approve} disabled={busy} className="cursor-pointer">
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRejecting((v) => !v)}
                  disabled={busy}
                  className="cursor-pointer"
                >
                  Reject
                </Button>
              </div>
            )}

            {!decided && rejecting && (
              <div className="space-y-2">
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Why is this suggestion wrong?"
                  className="text-sm"
                  aria-label={`Rejection reason for issue ${row.number}`}
                />
                <Button size="sm" variant="outline" onClick={reject} disabled={busy} className="cursor-pointer">
                  Record rejection
                </Button>
              </div>
            )}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

function Panel() {
  const { repo, listing, reload, select, rpc } = useListing();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [seed, setSeed] = useState<StartThreadSeed | null>(null);
  const [batch, setBatch] = useState<number[]>([]);

  async function research() {
    if (!repo || !listing) return;
    const result = (await rpc.call('researchSeed', { repo, count: listing.batchSize })) as {
      seed: Omit<StartThreadSeed, 'preview'> | null;
      numbers: number[];
      reason: string | null;
    };
    if (!result.seed) {
      toast.error(result.reason ?? 'Nothing to research.');
      return;
    }
    setBatch(result.numbers);
    setSeed({
      ...result.seed,
      preview: {
        title: `Research ${result.numbers.length} stale issue${result.numbers.length === 1 ? '' : 's'}`,
        number: result.numbers.length,
        url: `https://github.com/${repo}/issues`,
        meta: result.numbers.map((n) => `#${n}`).join(' · '),
      },
    });
    setDialogOpen(true);
  }

  async function submit(request: NewThreadRequest) {
    if (!repo) return;
    const result = (await rpc.call('startResearch', { request, repo, numbers: batch })) as {
      threadId: string | null;
      reason: string | null;
    };
    setDialogOpen(false);
    if (result.threadId) toast.success('Research thread started.');
    else toast.error(result.reason ?? 'Could not start the thread.');
    void reload();
  }

  if (!repo) {
    return (
      <div className="flex flex-col items-center gap-4 p-10">
        <EmptyGraphic graphic={<Icon name="Archive" className="size-10 text-muted-foreground" />} headline="No repository picked">
          Triage works one backlog at a time. Pick a repository to sweep.
        </EmptyGraphic>
        <RepoPicker value={repo} onChange={(next) => void select(next)} />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="p-10">
        <LoadingGraphic caption={`Sweeping ${repo}`}>
          <Icon name="Spinner" className="size-6 animate-spin text-muted-foreground" />
        </LoadingGraphic>
      </div>
    );
  }

  const { counts } = listing;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <RepoPicker value={repo} onChange={(next) => void select(next)} />
        <Button size="sm" variant="outline" onClick={research} className="cursor-pointer">
          Research next {listing.batchSize}
        </Button>
        <span className="text-xs text-muted-foreground">
          {listing.total} open · {counts.researched} awaiting you · {counts.approved} approved · {counts.rejected} rejected
        </span>
      </div>

      {listing.lastError && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive break-words">
          {listing.lastError}
        </div>
      )}

      {listing.truncated && (
        <div className="text-xs text-muted-foreground">
          This repository has more open issues than one sweep can list, so the tail may be missing.
        </div>
      )}

      {listing.rows.length === 0 ? (
        <EmptyGraphic graphic={<Icon name="Check" className="size-10 text-muted-foreground" />} headline={`Nothing open in ${repo}`}>
          Every issue in this repository is closed.
        </EmptyGraphic>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-3 py-2">Issue</TableHead>
              <TableHead className="px-3 py-2 w-[110px]">Action</TableHead>
              <TableHead className="px-3 py-2">Draft and decision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listing.rows.map((row) => (
              <TriageRowView key={`${row.repo}#${row.number}`} row={row} onDone={reload} />
            ))}
          </TableBody>
        </Table>
      )}

      {seed && (
        <StartThreadDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          heading="Start a research batch"
          description="Starts a thread that reads each issue and proposes what should happen to it."
          draftKey={`${repo}:research`}
          seed={seed}
          onSubmit={submit}
        />
      )}
    </div>
  );
}

function SyncHeader() {
  const { repo, listing, reload, rpc } = useListing();
  const [busy, setBusy] = useState(false);

  const onRefresh = useCallback(async () => {
    if (!repo) return;
    setBusy(true);
    try {
      const result = (await rpc.call('sync', { repo })) as { ok: boolean; error: string | null };
      if (!result.ok) toast.error(result.error ?? 'Sweep failed.');
      await reload();
    } finally {
      setBusy(false);
    }
  }, [reload, repo, rpc]);

  return <SyncStatus sweptAt={listing?.sweptAt ?? null} busy={busy} onRefresh={() => void onRefresh()} />;
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: 'backlog-triage',
    title: 'Backlog',
    icon: 'Archive',
    path: 'backlog-triage',
    component: Panel,
    headerContent: SyncHeader,
  });
});
