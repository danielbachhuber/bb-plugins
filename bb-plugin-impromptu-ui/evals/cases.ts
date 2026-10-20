// Turn endings that the thread instructions should, or should not, turn into
// a view. Each case comes from a commit that changed the instructions after a
// thread got it wrong, named in `source`. The replies are the kind an agent
// writes at the end of a turn; none of them names a real repository or
// person.

export type Expect =
  /** A view published with `"layout": "inline"`. */
  | "inline"
  /** A view published in any layout. */
  | "view"
  /** Nothing published. */
  | "none";

export interface Option {
  /** What the option is, for the report. */
  label: string;
  match: RegExp;
}

export interface EvalCase {
  id: string;
  /** The commit whose message describes this moment. */
  source: string;
  /** What the user asked for at the start of the turn. */
  request: string;
  /**
   * A task case: a small repository, committed and pushed to a local remote,
   * that the agent works in to answer the request, ending the turn with its
   * own reply. This is the realistic test, and a sample takes a minute or so.
   */
  files?: Record<string, string>;
  /**
   * A draft case: the reply the agent drafted once the work is done, handed
   * to it with "finish the turn". Quick, but easier than a real turn, because
   * it puts the reply in front of the agent to check.
   */
  reply?: string;
  expect: Expect;
  /**
   * What the view must offer. Each option matches a question or card title,
   * or a button's label, message, or command, in the last view published.
   * Wording varies between runs, so each one is a pattern, not a label.
   */
  options?: Option[];
  /** Items the view must mark finished with `status.complete`, by title. */
  done?: RegExp[];
  /** When set, the view must be published under this key. */
  key?: string;
  /** A view already above the composer when the turn starts. */
  existingView?: { key: string; json: string };
}

const PACKAGE_JSON = `${JSON.stringify({ type: "module", scripts: { test: "node --test", screenshots: "echo captured" } }, null, 2)}\n`;

export const CASES: EvalCase[] = [
  {
    id: "task-approval-as-statement",
    source: "approval asked as a statement, after 5c8c6fa",
    request: "The cart total is wrong when there are several items: it seems to skip one. Can you fix it?",
    files: {
      "AGENTS.md": [
        "# widgets",
        "",
        "- Run `node --test` before you report.",
        "- Do not commit until the user has tried the fix in the app and confirmed it works. Then commit the changed files by name, push, and run `npm run screenshots`.",
        "",
      ].join("\n"),
      "package.json": PACKAGE_JSON,
      "total.js": [
        "export function total(items) {",
        "  let sum = 0;",
        "  for (let i = 1; i < items.length; i++) sum += items[i].price * items[i].qty;",
        "  return sum;",
        "}",
        "",
      ].join("\n"),
      "total.test.js": [
        'import { test } from "node:test";',
        'import assert from "node:assert";',
        'import { total } from "./total.js";',
        'test("sums one item", () => assert.equal(total([{ price: 2, qty: 3 }]), 6));',
        "",
      ].join("\n"),
    },
    expect: "inline",
    options: [
      { label: "It works: commit and push", match: /commit|push|works|looks right/i },
      { label: "Still wrong", match: /still|wrong|broken|not (fixed|right|working)|doesn.t/i },
    ],
  },
  {
    id: "task-commit-question",
    source: "5c8c6fa",
    request: "Make `fetchPage` retry when the API answers 429, up to three times.",
    files: {
      "AGENTS.md": ["# widgets", "", "- Run `node --test` before you report.", "- Ask the user before you commit or push.", ""].join("\n"),
      "package.json": PACKAGE_JSON,
      "fetch.js": [
        "export async function fetchPage(url, fetchImpl = fetch) {",
        "  const response = await fetchImpl(url);",
        "  if (!response.ok) throw new Error(`HTTP ${response.status}`);",
        "  return response.json();",
        "}",
        "",
      ].join("\n"),
      "fetch.test.js": [
        'import { test } from "node:test";',
        'import assert from "node:assert";',
        'import { fetchPage } from "./fetch.js";',
        'test("returns the body", async () => {',
        "  const fake = async () => ({ ok: true, status: 200, json: async () => ({ rows: [] }) });",
        '  assert.deepEqual(await fetchPage("/rows", fake), { rows: [] });',
        "});",
        "",
      ].join("\n"),
    },
    expect: "inline",
    options: [{ label: "Commit and push", match: /commit/i }],
  },
  {
    id: "approval-as-statement",
    source: "approval asked as a statement, after 5c8c6fa",
    request: "The Generate button doesn't pick up a summary submitted from the CLI while the tab is open. Can you fix it?",
    reply: [
      "I've fixed it: while the tab shows the Generate button, it now checks every 2 seconds for a summary submitted from the CLI and opens it when one appears. Type checks and the 6 existing tests pass, and the plugin is built and reloaded. Nothing is committed.",
      "",
      "I also updated the README where it lists when the plugin makes requests. Once you confirm it works, I'll commit both files by name, push, and run the screenshot capture.",
    ].join("\n"),
    expect: "inline",
    options: [
      { label: "It works: commit and push", match: /commit|push|works|looks right/i },
      { label: "Still wrong", match: /still|wrong|broken|not (fixed|right|working)|doesn.t/i },
    ],
  },
  {
    id: "commit-question-after-report",
    source: "5c8c6fa",
    request: "Add a retry to the sync job when the API returns a 429.",
    reply: [
      "The sync job now retries a 429 up to three times, waiting for the `Retry-After` header when the API sends one and 2, 4, then 8 seconds when it does not.",
      "",
      "**What changed**",
      "- `sync/fetch.ts`: a `withRetry` wrapper around each page request.",
      "- `sync/fetch.test.ts`: four new tests, for a header, no header, three failures, and a non-429 error.",
      "- The README's section on API calls now says a rate-limited run can take up to 14 seconds longer.",
      "",
      "All 31 tests pass and the type check is clean. Should I commit and push?",
    ].join("\n"),
    expect: "inline",
    options: [{ label: "Commit and push", match: /commit/i }],
  },
  {
    id: "plan-approval",
    source: "5a70459",
    request: "The settings page is slow to open. Can you look into it?",
    reply: [
      "The page loads every saved filter's preview on open, one request per filter, and with 40 filters that is about 3 seconds.",
      "",
      "My plan: load previews only for the filters on screen, and fetch the rest when the list scrolls to them. That is a change to `settings/filters.tsx` and its test, and it leaves the stored data alone.",
      "",
      "Shall I go ahead?",
    ].join("\n"),
    expect: "inline",
    options: [{ label: "Go ahead", match: /go ahead|proceed|do it|yes|start|approve/i }],
  },
  {
    id: "numbered-options",
    source: "784298f",
    request: "Why does the export sometimes produce an empty file?",
    reply: [
      "The export writes the file before the last query finishes, when the list has more than one page. I see three ways to fix it:",
      "",
      "1. Await every page before writing. Smallest change, but a large export holds everything in memory.",
      "2. Stream each page to the file as it arrives. More code, constant memory.",
      "3. Refuse to export more than one page and say so. Quick, but loses a feature.",
      "",
      "Which should I do?",
    ].join("\n"),
    expect: "view",
    options: [
      { label: "Await every page", match: /await|all pages|every page|wait for/i },
      { label: "Stream each page", match: /stream/i },
      { label: "Limit to one page", match: /limit|refuse|one page|single page/i },
    ],
  },
  {
    id: "suggestions-no-question",
    source: "ad8ecb8",
    request: "Read through the onboarding docs and tell me what's out of date.",
    reply: [
      "Five things in the onboarding docs no longer match the code:",
      "",
      "1. The setup section still says to run `make bootstrap`, which was replaced by `./setup.sh`.",
      "2. The list of environment variables is missing `CACHE_DIR`.",
      "3. The screenshots of the settings page show the old sidebar.",
      "4. The testing section says tests run on Node 20; the project now pins Node 26.",
      "5. The link to the style guide points to a page that was deleted.",
    ].join("\n"),
    expect: "view",
    options: [
      { label: "Setup command", match: /bootstrap|setup\.sh/i },
      { label: "CACHE_DIR", match: /CACHE_DIR/ },
      { label: "Settings screenshots", match: /screenshot|sidebar/i },
      { label: "Node version", match: /node (20|26)/i },
      { label: "Style guide link", match: /style guide/i },
    ],
  },
  {
    id: "republish-after-button",
    source: "06ee9ed",
    request: "[Impromptu UI button] Fix the finding \"Missing null check in parseRow\" as shown in its card.",
    reply: "I added the null check to `parseRow` and a test for an empty row. All tests pass.",
    expect: "view",
    options: [
      { label: "Missing null check, kept", match: /null check/i },
      { label: "Rename tmp to rows, still open", match: /tmp/i },
    ],
    done: [/null check/i],
    key: "review",
    existingView: {
      key: "review",
      json: JSON.stringify({
        title: "Review findings",
        sections: [{
          items: [
            { id: "null-check", title: "Missing null check in parseRow", summary: "An empty row throws.", actions: [{ type: "message", label: "Fix it", text: "Fix the finding \"Missing null check in parseRow\" as shown in its card." }] },
            { id: "naming", title: "Rename tmp to rows", summary: "The name hides what it holds.", actions: [{ type: "message", label: "Fix it", text: "Fix the finding \"Rename tmp to rows\" as shown in its card." }] },
          ],
        }],
      }),
    },
  },
  {
    id: "plain-answer",
    source: "negative case",
    request: "What does the `--dry-run` flag do in the deploy script?",
    reply: "`--dry-run` prints each command the deploy would run, with the resolved image tag and target, and exits before running any of them. It still reads the config, so a bad config fails the same way a real deploy would.",
    expect: "none",
  },
  {
    id: "finished-report",
    source: "negative case",
    request: "commit and push",
    reply: "I committed the fix as 3f2a91c and pushed it to `main`. The commit holds only the two files the fix changed, and the working tree is clean.",
    expect: "none",
  },
];
