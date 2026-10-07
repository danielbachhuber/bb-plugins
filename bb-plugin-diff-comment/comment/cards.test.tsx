// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommentCard, CommentComposer, type GithubTarget } from "./cards";
import type { Comment } from "./types";

vi.mock("@get-bb/plugin-sdk/app", () => ({
  Markdown: ({ content }: { content: string }) => <p>{content}</p>,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement | null = null;

async function render(element: React.ReactElement): Promise<HTMLElement> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  return container;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
});

function button(scope: HTMLElement, label: string): HTMLButtonElement | null {
  return (
    Array.from(scope.querySelectorAll("button")).find((node) => node.textContent === label) ?? null
  );
}

async function type(box: HTMLTextAreaElement, text: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(box, text);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function composer(target: GithubTarget, post = vi.fn(async () => {})) {
  return (
    <CommentComposer
      location="src/a.ts:2"
      onSave={() => {}}
      onCancel={() => {}}
      github={{ check: async () => target, post }}
    />
  );
}

describe("CommentComposer's GitHub button", () => {
  it("shows disabled, with the reason, when there is no pull request", async () => {
    const view = await render(
      composer({ state: "blocked", reason: "Open a pull request to add review comments." }),
    );
    const add = button(view, "Add to GitHub review")!;
    expect(add.disabled).toBe(true);
    expect(add.parentElement!.title).toBe("Open a pull request to add review comments.");
  });

  it("is absent when GitHub is turned off", async () => {
    const view = await render(composer({ state: "off" }));
    expect(button(view, "Add to GitHub review")).toBeNull();
  });

  it("posts the body, and keeps it with the reason when GitHub refuses", async () => {
    const post = vi.fn(async () => {
      throw new Error("pull request is locked");
    });
    const view = await render(composer({ state: "ready", number: 7 }, post));
    const box = view.querySelector("textarea")!;
    await type(box, "Why four?");
    await act(async () => button(view, "Add to GitHub review")!.click());

    expect(post).toHaveBeenCalledWith("Why four?");
    expect(view.textContent).toContain("pull request is locked");
    expect(box.value).toBe("Why four?");
    expect(button(view, "Add to GitHub review")!.disabled).toBe(false);
  });
});

describe("CommentCard's Post to GitHub", () => {
  const base: Comment = {
    id: "c1",
    threadId: "thr_1",
    path: "src/a.ts",
    side: "new",
    line: 2,
    anchor: { text: "b", before: null, after: null },
    body: "Why b?",
    state: "addressed",
    reply: "Because the gadget needs it.",
    seq: 1,
    createdAt: "2026-09-14T00:00:00.000Z",
    updatedAt: "2026-09-14T00:00:00.000Z",
  };
  const card = (comment: Comment, check = vi.fn(async (): Promise<GithubTarget> => ({ state: "ready", number: 7 }))) => (
    <CommentCard
      comment={comment}
      onSetState={() => {}}
      onEdit={() => {}}
      onRemove={() => {}}
      github={{ check, post: async () => {} }}
    />
  );

  it("is offered once the agent has answered", async () => {
    const view = await render(card(base));
    expect(button(view, "Post to GitHub")!.disabled).toBe(false);
  });

  it("is not offered, or checked, before the agent answers", async () => {
    const check = vi.fn(async (): Promise<GithubTarget> => ({ state: "ready", number: 7 }));
    const view = await render(card({ ...base, state: "open", reply: null }, check));
    expect(button(view, "Post to GitHub")).toBeNull();
    expect(check).not.toHaveBeenCalled();
  });

  it("links to GitHub instead once posted", async () => {
    const view = await render(card({ ...base, github: { url: "https://github.com/acme/widgets/pull/7#discussion_r1" } }));
    expect(button(view, "Post to GitHub")).toBeNull();
    expect(view.querySelector("a")!.getAttribute("href")).toContain("discussion_r1");
  });
});
