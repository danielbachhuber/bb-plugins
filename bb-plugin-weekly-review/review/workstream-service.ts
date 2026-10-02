/**
 * What the page and the CLI do with workstreams, on top of the two stores.
 * No network or bb API, so `server.ts` only has to route to it.
 */
import { activities, type Activity } from "./activity.js";
import type { WeekStore } from "./db.js";
import { suggestWorkstreams, type Suggestion } from "./suggestions.js";
import type { WorkstreamStore } from "./workstream-store.js";
import { tableText, unsortedText } from "./workstreams-text.js";
import {
  buildTable,
  previewRule,
  RULE_TYPES,
  type Rule,
  type RulePreview,
  type RuleType,
  type Workstream,
  type WorkstreamTable,
} from "./workstreams.js";

export interface WorkstreamView {
  table: WorkstreamTable | null;
  workstreams: Array<Workstream & { rules: Rule[] }>;
  suggestions: Suggestion[];
}

export function createWorkstreamService(weeks: WeekStore, store: WorkstreamStore, now = () => new Date()) {
  const at = () => now().toISOString();

  function table(monday: string): { table: WorkstreamTable; items: Activity[] } | null {
    const week = weeks.readWeek(monday);
    if (week === null) return null;
    const items = activities(week);
    return {
      items,
      table: buildTable(
        monday,
        items,
        store.workstreams(),
        store.rules(),
        store.assignments(),
        store.choices(monday),
      ),
    };
  }

  function view(monday: string): WorkstreamView {
    const workstreams = store.workstreams();
    const rules = store.rules();
    const built = table(monday);
    const week = built === null ? null : weeks.readWeek(monday);
    return {
      table: built?.table ?? null,
      workstreams: workstreams.map((workstream) => ({
        ...workstream,
        rules: rules.filter((rule) => rule.workstreamId === workstream.id),
      })),
      suggestions:
        built === null || week === null
          ? []
          : suggestWorkstreams(week, built.items, built.table, workstreams),
    };
  }

  function requireWorkstream(nameOrId: string): Workstream {
    const found = store.find(nameOrId);
    if (found === null) throw new Error(`No workstream named ${nameOrId}.`);
    return found;
  }

  function preview(type: RuleType, value: string): RulePreview {
    const stored = weeks.listWeeks().flatMap((summary) => {
      const week = weeks.readWeek(summary.monday);
      return week === null ? [] : [{ items: activities(week) }];
    });
    return previewRule({ type, value }, stored, store.rules(), store.assignments());
  }

  /** Recomputed here rather than trusted from the page: the rules and keys are the server's. */
  function acceptSuggestion(monday: string, name: string): void {
    const suggestion = view(monday).suggestions.find(
      (candidate) => candidate.name.toLowerCase() === name.trim().toLowerCase(),
    );
    if (suggestion === undefined) throw new Error(`Nothing suggests a workstream named ${name}.`);
    const workstream = store.create(suggestion.name, at());
    for (const rule of suggestion.rules) {
      try {
        store.addRule(workstream.id, rule.type, rule.value, at());
      } catch {
        // Already a rule for another workstream; the assignments still sort this week.
      }
    }
    for (const key of suggestion.keys) store.assign(key, workstream.id, at());
  }

  return {
    view,
    preview,
    acceptSuggestion,
    create: (name: string) => store.create(name, at()),
    rename: (id: number, name: string) => store.rename(id, name),
    retire: (id: number) => store.retire(id, at()),
    addRule: (workstreamId: number, type: RuleType, value: string) =>
      store.addRule(workstreamId, type, value, at()),
    removeRule: (id: number) => store.removeRule(id),
    assign: (key: string, workstreamId: number | null) => store.assign(key, workstreamId, at()),
    unassign: (key: string) => store.unassign(key),
    setChoice: (monday: string, workstreamId: number, state: "added" | "hidden" | null) =>
      store.setChoice(monday, workstreamId, state),

    /** The section `digest` appends, or null before any workstream exists. */
    digestSection(monday: string): string | null {
      if (store.workstreams().length === 0) return null;
      const built = table(monday);
      return built === null ? null : `## Workstreams\n\n${tableText(built.table)}`;
    },

    /** `bb weekly-review workstream|rule|assign|week|table|unsorted …` */
    run(command: string, args: string[], currentMonday: string): { exitCode: number; stdout?: string; stderr?: string } {
      const ok = (stdout: string) => ({ exitCode: 0, stdout });
      const fail = (stderr: string) => ({ exitCode: 1, stderr });
      try {
        switch (command) {
          case "workstream": {
            const [action, ...rest] = args;
            if (action === undefined || action === "list") {
              const listed = view(currentMonday).workstreams;
              if (listed.length === 0) return ok("No workstreams yet.");
              return ok(listed.map((workstream) => {
                const rules = workstream.rules.map((rule) => `${rule.type}:${rule.value}`).join(", ");
                const retired = workstream.retiredAt === null ? "" : " (retired)";
                return `${workstream.id}  ${workstream.name}${retired}${rules === "" ? "" : `  [${rules}]`}`;
              }).join("\n"));
            }
            if (action === "add") {
              const created = store.create(rest.join(" "), at());
              return ok(`${created.id}  ${created.name}`);
            }
            if (action === "rename") {
              const [from, ...to] = rest;
              const workstream = requireWorkstream(from ?? "");
              store.rename(workstream.id, to.join(" "));
              return ok(`Renamed ${workstream.name} to ${to.join(" ")}`);
            }
            if (action === "retire") {
              const workstream = requireWorkstream(rest.join(" "));
              store.retire(workstream.id, at());
              return ok(`Retired ${workstream.name}`);
            }
            return fail("Usage: workstream list | add <name> | rename <name|id> <new name> | retire <name|id>");
          }
          case "rule": {
            const [action, ...rest] = args;
            if (action === undefined || action === "list") {
              const names = new Map(store.workstreams().map((workstream) => [workstream.id, workstream.name]));
              const rules = store.rules();
              if (rules.length === 0) return ok("No rules yet.");
              return ok(rules.map((rule) =>
                `${rule.id}  ${rule.type}  ${rule.value}  → ${names.get(rule.workstreamId) ?? "?"}`).join("\n"));
            }
            if (action === "add") {
              const [workstreamName, type, ...value] = rest;
              if (!RULE_TYPES.includes(type as RuleType)) {
                return fail(`Rule type must be one of: ${RULE_TYPES.join(", ")}.`);
              }
              const workstream = requireWorkstream(workstreamName ?? "");
              const rule = store.addRule(workstream.id, type as RuleType, value.join(" "), at());
              const caught = preview(rule.type, rule.value);
              return ok(`${rule.id}  ${rule.type}  ${rule.value}  → ${workstream.name}  (matches ${caught.matches} across ${caught.weeks} weeks)`);
            }
            if (action === "remove") {
              return store.removeRule(Number(rest[0])) ? ok(`Removed rule ${rest[0]}`) : fail(`No rule ${rest[0]}.`);
            }
            return fail("Usage: rule list | add <workstream> <ref|task|label|phrase> <value> | remove <id>");
          }
          case "assign": {
            const [key, ...target] = args;
            if (key === undefined || target.length === 0) return fail("Usage: assign <key> <workstream|none|rules>");
            const name = target.join(" ");
            if (name === "rules") {
              store.unassign(key);
              return ok(`${key} is back to the rules`);
            }
            const workstream = name === "none" ? null : requireWorkstream(name);
            store.assign(key, workstream?.id ?? null, at());
            return ok(`${key} → ${workstream?.name ?? "Unsorted"}`);
          }
          case "week": {
            const [monday, action, ...rest] = args;
            const states = { add: "added", hide: "hidden", reset: null } as const;
            if (monday === undefined || action === undefined || !(action in states)) {
              return fail("Usage: week <monday> add|hide|reset <workstream>");
            }
            const workstream = requireWorkstream(rest.join(" "));
            store.setChoice(monday, workstream.id, states[action as keyof typeof states]);
            return ok(`${action} ${workstream.name} for ${monday}`);
          }
          case "table":
          case "unsorted": {
            const monday = args[0] ?? currentMonday;
            const built = table(monday);
            if (built === null) return fail(`No week gathered for ${monday}.`);
            return ok(command === "table" ? tableText(built.table) : unsortedText(built.table));
          }
        }
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
      return fail(`Unknown command ${command}.`);
    },
  };
}

export type WorkstreamService = ReturnType<typeof createWorkstreamService>;
