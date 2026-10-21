import type { ReactNode } from "react";
import { ServicesStrip, type ServicesStripProps } from "./components/services-strip";
import type { StripAction, StripService } from "./services/contract";

export default {
  title: "dev-bar/Strip",
};

const noop = () => {};

const ALL_VERBS: StripService["verbs"] = ["start", "stop", "restart"];

const services: StripService[] = [
  { id: "db", label: "Database", state: "running", url: null, message: "Shared by every worktree", verbs: ["start"] },
  { id: "api", label: "API", state: "running", url: "http://localhost:4100", message: null, verbs: ALL_VERBS },
  { id: "web", label: "Web", state: "running", url: "http://localhost:5174", message: null, verbs: ALL_VERBS },
  { id: "stories", label: "Stories", state: "starting", url: "http://localhost:61001", message: null, verbs: ALL_VERBS },
  { id: "sync", label: "Sync", state: "stopped", url: null, message: null, verbs: ALL_VERBS },
  { id: "desktop", label: "Desktop app", state: "stopped", url: null, message: null, verbs: ALL_VERBS },
];

const actions: StripAction[] = [
  { index: 0, label: "Start all", confirm: null },
  { index: 1, label: "Stop all", confirm: null },
  { index: 2, label: "Reset database", confirm: "Replace this worktree's database with seeded data?" },
];

/** The bottom of a thread pane, wide and then narrow (as with a side panel open): the composer, then the bar edge to edge. */
function UnderComposer({ children }: { children: ReactNode }) {
  return (
    <div data-screenshot-frame className="space-y-4 p-4">
      {[1000, 540].map((width) => (
        <div key={width} style={{ width }} className="overflow-hidden rounded-lg border border-border bg-background">
          <div className="mx-auto max-w-[760px] px-4 pb-4 pt-4">
            <div className="h-20 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
              Ask for follow-up changes
            </div>
          </div>
          {children}
        </div>
      ))}
    </div>
  );
}

function Story(props: Partial<ServicesStripProps>) {
  return (
    <UnderComposer>
      <ServicesStrip
        services={services}
        actions={actions}
        loaded
        source=".bb/dev-bar.json"
        busy={new Set()}
        failure={null}
        onRun={noop}
        onOpen={noop}
        onDismissFailure={noop}
        {...props}
      />
    </UnderComposer>
  );
}

/** Four of six services up, one still starting, with the repository's own buttons at the end. */
export const Running = () => <Story />;

/** Every service stopped, as in a fresh worktree. */
export const AllStopped = () => (
  <Story services={services.map((service) => ({ ...service, state: "stopped" as const }))} />
);

/** Start all is running, so its button shows a spinner. */
export const Busy = () => <Story busy={new Set(["action:0"])} />;

/** A start that exited with an error shows the last lines it printed. */
export const ActionFailed = () => (
  <Story
    services={services.map((service) =>
      service.id === "web" ? { ...service, state: "failed" as const, message: "Port 5174 is in use" } : service,
    )}
    failure={{
      title: "Start web",
      command: "npm run services -- start web",
      output: "Starting web on port 5174…\nError: listen EADDRINUSE: address already in use :::5174\nweb exited with code 1",
    }}
  />
);

/** The status command failed, so there are no services to show. */
export const StatusFailed = () => (
  <Story
    services={[]}
    failure={{ title: "Status", command: "npm run services -- status", output: "sh: npm: command not found" }}
  />
);

/** Before the first status arrives. */
export const Loading = () => <Story services={[]} actions={[]} loaded={false} />;
