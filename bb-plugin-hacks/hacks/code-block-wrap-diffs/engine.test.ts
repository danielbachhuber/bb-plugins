// @vitest-environment jsdom
//
// The loop driven against code blocks shaped like bb's MarkdownCode, with a
// fake bb standing in for React: clicking the wrap toggle flips
// `aria-pressed` and the label, the way bb's own button does.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startEngine, type Engine } from "./engine";

function renderBlock(language: string): HTMLButtonElement {
  const host = document.createElement("div");
  host.innerHTML = `
    <div class="my-2 overflow-hidden rounded-md border">
      <div class="flex items-center justify-between">
        <span class="font-mono text-xs uppercase">${language}</span>
        <div class="flex items-center gap-0.5">
          <button type="button" aria-pressed="false" aria-label="Wrap long lines"></button>
          <button type="button" aria-label="Copy code"></button>
        </div>
      </div>
      <pre class="overflow-x-auto"><code>+added</code></pre>
    </div>`;
  document.body.append(host);
  const toggle = host.querySelector("button") as HTMLButtonElement;
  toggle.addEventListener("click", () => {
    const pressed = toggle.getAttribute("aria-pressed") === "true";
    toggle.setAttribute("aria-pressed", String(!pressed));
    toggle.setAttribute(
      "aria-label",
      pressed ? "Wrap long lines" : "Disable line wrap",
    );
  });
  return toggle;
}

const isWrapped = (toggle: HTMLButtonElement) =>
  toggle.getAttribute("aria-pressed") === "true";

let controller: AbortController;
let engine: Engine;
let pending: (() => void)[] = [];

function flush(): void {
  for (let guard = 0; guard < 20 && pending.length > 0; guard += 1) {
    const queued = pending;
    pending = [];
    for (const run of queued) run();
  }
}

/** Let the MutationObserver deliver, then run what it scheduled. */
async function settle(): Promise<void> {
  await Promise.resolve();
  flush();
}

beforeEach(() => {
  controller = new AbortController();
  pending = [];
  engine = startEngine({
    signal: controller.signal,
    doc: document,
    defer: (run) => {
      pending.push(run);
      return () => {
        pending = pending.filter((queued) => queued !== run);
      };
    },
  });
});

afterEach(() => {
  engine.dispose();
  controller.abort();
  document.body.innerHTML = "";
});

describe("code-block-wrap-diffs", () => {
  it("wraps a diff block when it appears", async () => {
    const toggle = renderBlock("diff");
    await settle();
    expect(isWrapped(toggle)).toBe(true);
  });

  it("leaves other languages unwrapped", async () => {
    const ts = renderBlock("ts");
    const plain = renderBlock("");
    await settle();
    expect(isWrapped(ts)).toBe(false);
    expect(isWrapped(plain)).toBe(false);
  });

  it("keeps a diff block unwrapped once you unwrap it", async () => {
    const toggle = renderBlock("diff");
    await settle();
    toggle.click();
    expect(isWrapped(toggle)).toBe(false);
    renderBlock("ts");
    await settle();
    expect(isWrapped(toggle)).toBe(false);
  });

  it("wraps a diff block that was already on the page", () => {
    engine.dispose();
    const toggle = renderBlock("diff");
    engine = startEngine({
      signal: controller.signal,
      doc: document,
      defer: (run) => {
        pending.push(run);
        return () => {};
      },
    });
    flush();
    expect(isWrapped(toggle)).toBe(true);
  });
});
