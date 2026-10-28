// The header every page shares: a toolbar with the repository on the left,
// which goes back to the dashboard, and the person finder and span picker on
// the right; then, on every page but the dashboard, the page's title and a
// line saying what it covers. Display only.
import type { ReactNode } from "react";

import { PersonFinder } from "./person-finder";
import { Icon } from "./ui/icon";

export function PageHeader({
  repository,
  onHome,
  everyone,
  current = null,
  onOpenPerson,
  period = null,
  title = null,
  subtitle = null,
}: {
  /** Null before the repository is set, or while the page loads. */
  repository: string | null;
  /** Opens the dashboard. Left out on the dashboard itself. */
  onHome?: () => void;
  /** Who the finder offers, most recently active first. */
  everyone: readonly string[];
  /** The person whose page this is, marked in the finder's list. */
  current?: string | null;
  onOpenPerson: (login: string) => void;
  /** The span picker, on the pages a span changes. */
  period?: ReactNode;
  /** The page's own title. Null on the dashboard, where the repository is it. */
  title?: ReactNode;
  subtitle?: ReactNode;
}) {
  const home = (
    <>
      <Icon name="Home" className="size-3.5 shrink-0" />
      <span className="truncate">{repository ?? "Dashboard"}</span>
    </>
  );

  return (
    <header>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border pb-2">
        {onHome === undefined ? (
          <h1 className="-ml-1 flex min-w-0 items-center gap-1.5 px-1 py-0.5 text-sm font-medium text-foreground">{home}</h1>
        ) : (
          <button
            type="button"
            onClick={onHome}
            title="Back to the dashboard"
            className="-ml-1 flex min-w-0 cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {home}
          </button>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {repository === null ? null : <PersonFinder everyone={everyone} current={current} onOpenPerson={onOpenPerson} />}
          {period}
        </div>
      </div>
      {title === null ? null : (
        <div className="mt-3">
          <h1 className="text-lg font-semibold">{title}</h1>
          {subtitle === null ? null : <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      )}
    </header>
  );
}
