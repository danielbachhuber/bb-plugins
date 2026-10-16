// @vitest-environment jsdom
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const success = vi.fn();
vi.mock("sonner", () => ({ toast: { success } }));

// Counts mounts, so a test can tell the composer stayed mounted while hidden:
// bb's composer puts a failed prompt back only if it is still there.
let mounts = 0;
vi.mock("@get-bb/plugin-sdk/app", () => ({
  UrlLink: () => null,
  experimental_NewThreadComposer: ({ onSubmit }: { onSubmit: (request: unknown) => Promise<void> }) => {
    useEffect(() => {
      mounts += 1;
    }, []);
    return (
      <button type="button" onClick={() => void onSubmit({ input: [] }).catch(() => undefined)}>
        Send
      </button>
    );
  },
}));

const { useStartThreadBox } = await import("./start-thread");
const { StartingThreadLine } = await import("../thread-status/thread-status");

type Outcome = { threadId: string | null; existing?: boolean; error?: string | null };

function Page({
  submit,
  keys = ["acme/widgets#7"],
  scope,
  label = "",
}: {
  submit: () => Promise<Outcome>;
  keys?: string[];
  scope?: string;
  label?: string;
}) {
  const box = useStartThreadBox({ submit, navigate: { toThread: vi.fn() }, scope });
  return (
    <ul>
      {keys.map((key) => (
        <li key={key} data-testid={key}>
          {box.isStarting(key) ? <span>{label}starting {key}</span> : null}
          {box.startedThread(key) ? <span>{label}thread {box.startedThread(key)}</span> : null}
          <button type="button" onClick={() => box.toggle({ key, seed: { projectId: null } })}>
            {label}Start {key}
          </button>
          {box.boxFor(key)}
        </li>
      ))}
    </ul>
  );
}

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mounts = 0;
  success.mockClear();
});
afterEach(cleanup);

const sections = () => [...document.querySelectorAll<HTMLElement>('section[aria-label="Start a thread"]')];
const section = () => sections()[0] ?? null;

describe("useStartThreadBox", () => {
  it("hides the box while the thread starts, then drops it and announces the thread", async () => {
    const pending = deferred<Outcome>();
    render(<Page submit={() => pending.promise} />);
    fireEvent.click(screen.getByText("Start acme/widgets#7"));
    fireEvent.click(screen.getByText("Send"));

    expect(screen.getByText("starting acme/widgets#7")).toBeTruthy();
    expect(section()?.hidden).toBe(true);

    await act(async () => pending.resolve({ threadId: "thr_1" }));
    expect(screen.queryByText("starting acme/widgets#7")).toBeNull();
    expect(screen.getByText("thread thr_1")).toBeTruthy();
    expect(section()).toBeNull();
    expect(success.mock.calls[0]?.[0]).toBe("Started a thread");
  });

  it("shows the box again, still mounted, with the reason at the top when no thread starts", async () => {
    const pending = deferred<Outcome>();
    render(<Page submit={() => pending.promise} />);
    fireEvent.click(screen.getByText("Start acme/widgets#7"));
    fireEvent.click(screen.getByText("Send"));
    await act(async () => pending.resolve({ threadId: null, error: "Another thread has the branch." }));

    expect(section()?.hidden).toBe(false);
    expect(screen.getByRole("alert").textContent).toBe("Another thread has the branch.");
    expect(mounts).toBe(1);
    expect(success).not.toHaveBeenCalled();
  });

  it("treats a thrown submit as a failure", async () => {
    render(<Page submit={() => Promise.reject(new Error("Network down"))} />);
    fireEvent.click(screen.getByText("Start acme/widgets#7"));
    await act(async () => fireEvent.click(screen.getByText("Send")));
    expect(screen.getByRole("alert").textContent).toBe("Network down");
  });

  it("keeps a starting row's box mounted while another row's box opens", async () => {
    const pending = deferred<Outcome>();
    render(<Page submit={() => pending.promise} keys={["acme/widgets#7", "acme/widgets#8"]} />);
    fireEvent.click(screen.getByText("Start acme/widgets#7"));
    fireEvent.click(screen.getByText("Send"));
    fireEvent.click(screen.getByText("Start acme/widgets#8"));

    expect(sections()).toHaveLength(2);
    await act(async () => pending.resolve({ threadId: null, error: "No project here." }));
    // The failed one comes back in place of the other.
    expect(screen.getByTestId("acme/widgets#7").querySelector("[role=alert]")).toBeTruthy();
    expect(screen.getByTestId("acme/widgets#8").querySelector("section")).toBeNull();
  });

  it("skips the toast for a thread that already existed", async () => {
    render(<Page submit={async () => ({ threadId: "thr_9", existing: true })} />);
    fireEvent.click(screen.getByText("Start acme/widgets#7"));
    await act(async () => fireEvent.click(screen.getByText("Send")));
    expect(success).not.toHaveBeenCalled();
  });
});

describe("useStartThreadBox with a scope", () => {
  it("says a row is starting, then has its thread, on every surface in the scope", async () => {
    const pending = deferred<Outcome>();
    render(
      <>
        <Page submit={() => pending.promise} scope="acme" label="list " />
        <Page submit={() => pending.promise} scope="acme" label="reader " />
        <Page submit={() => pending.promise} label="other " />
      </>,
    );
    fireEvent.click(screen.getByText("reader Start acme/widgets#7"));
    fireEvent.click(screen.getByText("Send"));

    expect(screen.getByText("list starting acme/widgets#7")).toBeTruthy();
    expect(screen.queryByText("other starting acme/widgets#7")).toBeNull();
    // The box stays with the surface it was opened on.
    expect(sections()).toHaveLength(1);

    await act(async () => pending.resolve({ threadId: "thr_1" }));
    expect(screen.queryByText("list starting acme/widgets#7")).toBeNull();
    expect(screen.getByText("list thread thr_1")).toBeTruthy();
    expect(screen.queryByText("other thread thr_1")).toBeNull();
  });
});

describe("StartingThreadLine", () => {
  it("says the thread is starting, with the title the row will be known by", () => {
    render(<StartingThreadLine title="Let widgets export to CSV (#487)" />);
    expect(screen.getByRole("status").textContent).toBe("Starting·Let widgets export to CSV (#487)");
  });
});
