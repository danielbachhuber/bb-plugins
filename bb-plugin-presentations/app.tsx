// bb-plugin-presentations — frontend entry.
//
// Three surfaces share one deck:
// - the Presentations page, which starts a presentation thread with bb's own
//   composer, and at present/<threadId> shows the deck alone for a second
//   window
// - a Present button in the thread header, shown only in presentation threads
// - the Slides panel beside the chat, with the slide files listed for editing
import { useCallback, useEffect, useRef, useState } from "react";
import {
  definePluginApp,
  experimental_NewThreadComposer as NewThreadComposer,
  experimental_usePluginId as usePluginId,
  useBbContext,
  useBbNavigate,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { Deck, rpcContract } from "./server";
import { DeckPanelView, DeckWindowView } from "./deck/view";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";

/** How often an open deck rereads its folder. */
const POLL_MS = 2000;

const PAGE_PATH = "presentations";
const PANEL_ACTION_ID = "slides";

/** A signature of what the deck shows, so an unchanged poll renders nothing. */
function deckSignature(deck: Deck): string {
  return JSON.stringify([deck.path, deck.problem, deck.slides.map((s) => [s.file, s.sha256])]);
}

/**
 * The thread's deck, reread every two seconds while the window is visible.
 * One request at a time: a slow read is never stacked under the next poll.
 */
function useDeck(threadId: string) {
  const rpc = useRpc<typeof rpcContract>();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const signature = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const load = () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      rpc.call("deck_load", { threadId }).then(
        (next) => {
          inFlight = false;
          if (cancelled) return;
          setError(null);
          const nextSignature = deckSignature(next);
          if (nextSignature === signature.current) return;
          signature.current = nextSignature;
          setDeck(next);
        },
        (cause: unknown) => {
          inFlight = false;
          if (cancelled) return;
          setError(cause instanceof Error ? cause.message : String(cause));
        },
      );
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [rpc, threadId]);

  return { deck, error };
}

/** Builds each image's URL on the asset route, for one thread's deck. */
function useImageUrl(threadId: string) {
  const rpc = useRpc<typeof rpcContract>();
  const [routePath, setRoutePath] = useState<string | null>(null);
  useEffect(() => {
    rpc.call("asset_base").then(
      (result) => setRoutePath(result.routePath),
      () => setRoutePath(null),
    );
  }, [rpc]);
  return useCallback(
    (file: string) => {
      if (routePath === null) return file;
      const query = new URLSearchParams({ threadId, file });
      return `${window.location.origin}${routePath}?${query.toString()}`;
    },
    [routePath, threadId],
  );
}

/** The current slide, kept inside the deck as slides come and go. */
function useSlideIndex(count: number) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (count > 0 && index > count - 1) setIndex(count - 1);
  }, [count, index]);
  return [index, setIndex] as const;
}

function SlidesPanel({ threadId }: { threadId: string }) {
  const { deck, error } = useDeck(threadId);
  const imageUrl = useImageUrl(threadId);
  const [index, setIndex] = useSlideIndex(deck?.slides.length ?? 0);
  const pluginId = usePluginId();
  const openWindow = useCallback(() => {
    const url = `${window.location.origin}/plugins/${pluginId}/${PAGE_PATH}/present/${encodeURIComponent(threadId)}`;
    window.open(url, "_blank", "noopener");
  }, [pluginId, threadId]);
  return (
    <DeckPanelView
      deck={deck}
      error={error}
      index={index}
      onIndexChange={setIndex}
      imageUrl={imageUrl}
      onOpenWindow={openWindow}
    />
  );
}

function PresentWindow({ threadId }: { threadId: string }) {
  const { deck, error } = useDeck(threadId);
  const imageUrl = useImageUrl(threadId);
  const [index, setIndex] = useSlideIndex(deck?.slides.length ?? 0);
  return (
    <div className="h-full min-h-0">
      <DeckWindowView
        deck={deck}
        error={error}
        index={index}
        onIndexChange={setIndex}
        imageUrl={imageUrl}
      />
    </div>
  );
}

/**
 * Starting a presentation: the deck folder, then bb's composer. Submitting
 * spawns the thread and opens it.
 */
function NewPresentationPage() {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const { projectId } = useBbContext();
  const [deckPath, setDeckPath] = useState("");

  const submit = useCallback(
    async (
      request: Parameters<React.ComponentProps<typeof NewThreadComposer>["onSubmit"]>[0],
    ) => {
      if (deckPath.trim() === "") {
        toast.error("Name the deck folder first.");
        // Rethrown so the composer keeps the draft.
        throw new Error("No deck folder");
      }
      try {
        const { threadId } = await rpc.call("deck_thread_create", {
          request: request as never,
          deckPath: deckPath.trim(),
        });
        navigate.toThread(threadId);
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "Could not start the thread.");
        throw cause;
      }
    },
    [deckPath, navigate, rpc],
  );

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto box-border w-full max-w-3xl px-4 pb-4 pt-3 md:px-5 md:pt-4">
        <h2 className="text-base font-medium text-foreground">New presentation</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Each slide is a markdown file in one folder, named with a number first, such as{" "}
          <code>01-title.md</code>. The thread you start here writes them, and its Present
          button shows them beside the chat.
        </p>
        <label className="mt-4 block text-sm font-medium" htmlFor="deck-folder">
          Deck folder
        </label>
        <Input
          id="deck-folder"
          className="mt-1.5 font-mono"
          placeholder="presentations/my-talk"
          value={deckPath}
          onChange={(event) => setDeckPath(event.target.value)}
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Relative to the thread's workspace, or an absolute path. The agent creates the folder
          if it does not exist yet.
        </p>
        <div className="mt-4">
          <NewThreadComposer
            defaultProjectId={projectId ?? undefined}
            placeholder="What is the talk about, and who is it for?"
            layout="document"
            onSubmit={submit}
          />
        </div>
      </div>
    </div>
  );
}

function PresentationsPage({ subPath }: { subPath: string }) {
  const present = /^present\/([^/]+)\/?$/.exec(subPath);
  if (present !== null) return <PresentWindow threadId={decodeURIComponent(present[1]!)} />;
  return <NewPresentationPage />;
}

/** Whether the thread has a deck. A failed lookup hides the button. */
function useIsDeck(threadId: string) {
  const rpc = useRpc<typeof rpcContract>();
  const [isDeck, setIsDeck] = useState(false);
  useEffect(() => {
    let cancelled = false;
    rpc.call("deck_info", { threadId }).then(
      (result) => {
        if (!cancelled) setIsDeck(result.isDeck);
      },
      () => {
        if (!cancelled) setIsDeck(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [rpc, threadId]);
  return isDeck;
}

function PresentHeaderAction({
  threadId,
  isCompactViewport,
}: {
  threadId: string;
  isCompactViewport: boolean;
}) {
  const isDeck = useIsDeck(threadId);
  const navigate = useBbNavigate();
  if (!isDeck) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7"
      aria-label="Present"
      onClick={() => {
        if (!navigate.openThreadPanel({ actionId: PANEL_ACTION_ID, title: "Slides" })) {
          toast.error("Could not open the slides panel here.");
        }
      }}
    >
      <Icon name="Play" className="size-4" />
      {isCompactViewport ? null : "Present"}
    </Button>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "presentations",
    title: "Presentations",
    icon: "Play",
    // Routed at /plugins/presentations/presentations.
    path: PAGE_PATH,
    component: PresentationsPage,
  });

  app.slots.experimental_threadHeaderAction({
    id: "present",
    title: "Present",
    component: PresentHeaderAction,
  });

  app.slots.threadPanelAction({
    id: PANEL_ACTION_ID,
    title: "Slides",
    icon: "Play",
    layout: "flush",
    component: ({ threadId }) => <SlidesPanel threadId={threadId} />,
  });
});
