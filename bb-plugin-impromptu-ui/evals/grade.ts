// Grades one sample: what the agent published, against what the case expects.
import type { EvalCase } from "./cases.ts";

export interface Call {
  args: string[];
  /** The view file's contents, for `publish`. */
  view?: string;
}

export function grade(c: EvalCase, calls: Call[]): { pass: boolean; why: string } {
  const publishes = calls.filter((call) => call.args[0] === "impromptu-ui" && call.args[1] === "publish" && call.view);
  if (c.expect === "none") {
    return publishes.length === 0 ? { pass: true, why: "nothing published" } : { pass: false, why: "published a view" };
  }
  if (publishes.length === 0) return { pass: false, why: "no view published" };
  const last = publishes[publishes.length - 1];
  let view: { layout?: string; sections?: { items?: ViewItem[] }[] } = {};
  try {
    view = JSON.parse(last.view ?? "{}");
  } catch {
    return { pass: false, why: "published a file that is not JSON" };
  }
  if (c.expect === "inline" && view.layout !== "inline") {
    return { pass: false, why: `published with layout ${view.layout ?? "(default)"}, not inline` };
  }
  if (c.key) {
    const keyAt = last.args.indexOf("--key");
    const key = keyAt === -1 ? undefined : last.args[keyAt + 1];
    if (key !== c.key) return { pass: false, why: `published under key ${key ?? "(none)"}, not ${c.key}` };
  }
  const missing = (c.options ?? []).filter((option) => !choices(view).some((choice) => option.match.test(choice)));
  if (missing.length) return { pass: false, why: `missing ${missing.map((option) => option.label).join(", ")}` };
  const items = allItems(view);
  const open = (c.done ?? []).filter((title) => !items.some((item) => title.test(item.title ?? "") && item.status?.complete));
  if (open.length) return { pass: false, why: `not marked finished: ${open.map(String).join(", ")}` };
  return { pass: true, why: view.layout === "inline" ? "published inline" : "published a view" };
}

interface ViewItem {
  title?: string;
  status?: { complete?: boolean };
  actions?: { label?: string; text?: string; command?: string }[];
}

function allItems(view: { sections?: { items?: ViewItem[] }[] }): ViewItem[] {
  return (view.sections ?? []).flatMap((section) => section.items ?? []);
}

/** Every question or card title, and every button's label, message, and command. */
function choices(view: { sections?: { items?: ViewItem[] }[] }): string[] {
  return allItems(view).flatMap((item) => [
    item.title ?? "",
    ...(item.actions ?? []).map((action) => [action.label, action.text, action.command].filter(Boolean).join(" ")),
  ]);
}
