// node --test scripts/check-component-library.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { compareEntries, entryFiles, formatReport, importSpecifiers, libraryEntries } from "./check-component-library.mjs";

const LIB = "@danielbachhuber/bb-plugin-component-library";

function pkg(exports, files) {
  return { exports, read: (file) => files[file] ?? null };
}

test("importSpecifiers finds imports, re-exports, and dynamic imports", () => {
  const source = `
    import { a } from "./a";
    import type { B } from '../b/b';
    export { c } from "./c";
    import "./side-effect";
    const d = await import("./d");
  `;
  assert.deepEqual(importSpecifiers(source), ["./a", "../b/b", "./c", "./side-effect", "./d"]);
});

test("libraryEntries lists each library entry once", () => {
  const sources = [
    `import { SyncStatus } from "${LIB}/sync-status";\nimport { x } from "react";`,
    `import { SyncStatus } from "${LIB}/sync-status";\nimport { DayMenu } from "${LIB}/day-menu";`,
  ];
  assert.deepEqual(libraryEntries(sources), ["day-menu", "sync-status"]);
});

test("entryFiles follows relative imports across directories", () => {
  const read = (file) =>
    ({
      "date-range/date-range.tsx": `import { Calendar } from "../calendar/calendar";\nimport { cn } from "../lib/cn";`,
      "calendar/calendar.tsx": `import { cn } from "../lib/cn";\nimport { DayPicker } from "react-day-picker";`,
      "lib/cn.ts": `export const cn = () => "";`,
    })[file] ?? null;
  assert.deepEqual(entryFiles("./date-range/date-range.tsx", read), [
    "calendar/calendar.tsx",
    "date-range/date-range.tsx",
    "lib/cn.ts",
  ]);
});

test("compareEntries reports an entry npm does not export", () => {
  const local = pkg({ "./sync-status": "./s/s.tsx", "./day-menu": "./d/d.tsx" }, { "s/s.tsx": "a", "d/d.tsx": "b" });
  const published = pkg({ "./sync-status": "./s/s.tsx" }, { "s/s.tsx": "a" });
  assert.deepEqual(compareEntries(["day-menu", "sync-status"], local, published), {
    missing: ["day-menu"],
    changed: [],
  });
});

test("compareEntries reports a changed file an entry reaches", () => {
  const local = pkg(
    { "./date-range": "./date-range/date-range.tsx" },
    { "date-range/date-range.tsx": `import "../calendar/calendar";`, "calendar/calendar.tsx": "new" },
  );
  const published = pkg(
    { "./date-range": "./date-range/date-range.tsx" },
    { "date-range/date-range.tsx": `import "../calendar/calendar";`, "calendar/calendar.tsx": "old" },
  );
  assert.deepEqual(compareEntries(["date-range"], local, published), {
    missing: [],
    changed: [{ entry: "date-range", files: ["calendar/calendar.tsx"] }],
  });
});

test("compareEntries reports a file added since the publish", () => {
  const local = pkg({ "./a": "./a/a.tsx" }, { "a/a.tsx": `import "./keys";`, "a/keys.ts": "k" });
  const published = pkg({ "./a": "./a/a.tsx" }, { "a/a.tsx": `import "./keys";` });
  assert.deepEqual(compareEntries(["a"], local, published).changed, [{ entry: "a", files: ["a/keys.ts"] }]);
});

test("compareEntries passes when nothing the plugin uses differs", () => {
  const local = pkg({ "./a": "./a/a.tsx", "./b": "./b/b.tsx" }, { "a/a.tsx": "same", "b/b.tsx": "new" });
  const published = pkg({ "./a": "./a/a.tsx", "./b": "./b/b.tsx" }, { "a/a.tsx": "same", "b/b.tsx": "old" });
  assert.deepEqual(compareEntries(["a"], local, published), { missing: [], changed: [] });
});

test("formatReport names what is missing and what changed", () => {
  const report = formatReport(
    { name: "now" },
    {
      version: "1.0.0",
      entries: ["day-menu", "thread-status"],
      missing: ["day-menu"],
      changed: [{ entry: "thread-status", files: ["thread-status/thread-status.tsx"] }],
    },
  );
  assert.equal(
    report,
    [
      "STOP  now: needs a component library newer than 1.0.0 on npm",
      "      day-menu: not in 1.0.0",
      "      thread-status: changed since 1.0.0 (thread-status/thread-status.tsx)",
    ].join("\n"),
  );
});
