// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GithubThreadCard } from "./card";
import type { GithubComment, GithubThread } from "./threads";

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

function comment(overrides: Partial<GithubComment>): GithubComment {
  return {
    id: "PRRC_1",
    url: "https://github.com/acme/widgets/pull/42#discussion_r1",
    author: "hubber",
    body: "Nit: rename this.",
    createdAt: "2026-09-17T11:00:00Z",
    pending: true,
    editable: true,
    ...overrides,
  };
}

function thread(comments: GithubComment[]): GithubThread {
  return {
    id: "PRRT_1",
    path: "src/sprocket.ts",
    side: "new",
    line: 18,
    anchor: { text: "  return gear.teeth * ratio;", before: null, after: null },
    resolved: false,
    outdated: false,
    comments,
  };
}

describe("GithubThreadCard", () => {
  it("offers Edit only on comments the viewer can edit", async () => {
    const scope = await render(
      <GithubThreadCard
        thread={thread([comment({ editable: false, author: "octocat" })])}
        number={42}
        onEdit={async () => {}}
      />,
    );
    expect(button(scope, "Edit")).toBeNull();
  });

  it("saves the new text to GitHub and shows it", async () => {
    const onEdit = vi.fn(async () => {});
    const scope = await render(
      <GithubThreadCard thread={thread([comment({})])} number={42} onEdit={onEdit} />,
    );
    await act(async () => button(scope, "Edit")!.click());
    await type(scope.querySelector("textarea")!, "Nit: rename this to `teethCount`.");
    await act(async () => button(scope, "Save")!.click());

    expect(onEdit).toHaveBeenCalledWith("PRRC_1", "Nit: rename this to `teethCount`.");
    expect(scope.querySelector("textarea")).toBeNull();
    expect(scope.textContent).toContain("Nit: rename this to `teethCount`.");
  });

  it("keeps the text in the box when GitHub refuses the edit", async () => {
    const onEdit = vi.fn(async () => {
      throw new Error("Resource not accessible");
    });
    const scope = await render(
      <GithubThreadCard thread={thread([comment({})])} number={42} onEdit={onEdit} />,
    );
    await act(async () => button(scope, "Edit")!.click());
    await type(scope.querySelector("textarea")!, "Changed.");
    await act(async () => button(scope, "Save")!.click());

    expect(scope.querySelector("textarea")!.value).toBe("Changed.");
    expect(scope.textContent).toContain("Resource not accessible");
  });
});
