// The coverage check: does a grouping place every item exactly once? Pure.
import { groupingSchema, type Grouping } from "./grouping";
import { itemKey, type Assignment, type Item } from "./types";

export type Violation =
  | { kind: "missing"; path: string; index: number }
  | { kind: "duplicate"; path: string; index: number; concerns: number[] }
  | { kind: "unknown-file"; path: string; concern: number }
  | { kind: "unknown-hunk"; path: string; index: number; concern: number }
  | { kind: "empty-concern"; concern: number };

export function parseGrouping(
  raw: unknown,
): { ok: true; grouping: Grouping } | { ok: false; messages: string[] } {
  const parsed = groupingSchema.safeParse(raw);
  if (parsed.success) return { ok: true, grouping: parsed.data };
  return {
    ok: false,
    messages: parsed.error.issues.map((issue) => `${issue.path.join(".") || "grouping"}: ${issue.message}`),
  };
}

export function resolveGrouping(
  items: Item[],
  grouping: Grouping,
  isMechanical: (path: string) => boolean,
): { assignments: Assignment[]; violations: Violation[] } {
  const byPath = new Map<string, Item[]>();
  for (const item of items) byPath.set(item.path, [...(byPath.get(item.path) ?? []), item]);

  const claims = new Map<string, number[]>();
  const violations: Violation[] = [];

  grouping.concerns.forEach((concern, ci) => {
    let claimed = 0;
    for (const ref of concern.files) {
      const path = typeof ref === "string" ? ref : ref.path;
      const fileItems = byPath.get(path);
      if (fileItems === undefined) {
        violations.push({ kind: "unknown-file", path, concern: ci });
        continue;
      }
      const indexes = typeof ref === "string" ? fileItems.map((item) => item.index) : ref.hunks;
      for (const index of indexes) {
        if (!fileItems.some((item) => item.index === index)) {
          violations.push({ kind: "unknown-hunk", path, index, concern: ci });
          continue;
        }
        const key = itemKey(path, index);
        const owners = claims.get(key) ?? [];
        if (!owners.includes(ci)) owners.push(ci);
        claims.set(key, owners);
        claimed++;
      }
    }
    if (claimed === 0) violations.push({ kind: "empty-concern", concern: ci });
  });

  const assignments: Assignment[] = [];
  for (const item of items) {
    const owners = claims.get(itemKey(item.path, item.index));
    if (owners === undefined) {
      if (!isMechanical(item.path)) violations.push({ kind: "missing", path: item.path, index: item.index });
      continue;
    }
    if (owners.length > 1) {
      violations.push({ kind: "duplicate", path: item.path, index: item.index, concerns: owners });
      continue;
    }
    assignments.push({ path: item.path, index: item.index, hash: item.hash, concern: owners[0]! });
  }
  return { assignments, violations };
}

export function formatViolation(violation: Violation, grouping: Grouping): string {
  const title = (ci: number) => `"${grouping.concerns[ci]?.title ?? `concern ${ci}`}"`;
  switch (violation.kind) {
    case "missing":
      return `missing: ${itemKey(violation.path, violation.index)} is in no concern. Add it to the concern it belongs to, or give it a small concern of its own.`;
    case "duplicate":
      return `duplicate: ${itemKey(violation.path, violation.index)} is in ${violation.concerns.map(title).join(" and ")}. Keep it in one.`;
    case "unknown-file":
      return `unknown file: ${title(violation.concern)} names ${violation.path}, which is not in the diff. Run \`bb super-diff hunks\` for the file list.`;
    case "unknown-hunk":
      return `unknown hunk: ${title(violation.concern)} names ${itemKey(violation.path, violation.index)}, which that file does not have. Hunks are numbered from 0; run \`bb super-diff hunks\`.`;
    case "empty-concern":
      return `empty concern: ${title(violation.concern)} holds nothing that is in the diff.`;
  }
}
