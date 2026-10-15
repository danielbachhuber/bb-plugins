// bb's quick palette with this plugin's rows in it. The palette is bb's own
// chrome, so the story rebuilds its markup around bb's real pieces: the app
// commands it lists, the Automations page row, its row class, and its ranking.
// Invented data.
import { experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import { LAUNCHER_ACTION_ROW_BASE_CLASS } from "@bb-app/components/secondary-panel/launcherRow";
import { buildAppCommandActions } from "@bb-app/lib/command-palette/palette-app-commands";
import type { PaletteAction } from "@bb-app/lib/command-palette/palette-action";
import { rankPaletteActions, type RankedPaletteAction } from "@bb-app/lib/command-palette/palette-ranking";
import type { AutomationSummary } from "./palette/automations";
import { paletteRows } from "./palette/rows";

export default {
  title: "automation-palette/Quick palette",
};

const noop = () => {};

const AUTOMATIONS: AutomationSummary[] = [
  { id: "auto_1", projectId: "proj_1", name: "Widget sweep", projectName: "Acme Widgets", enabled: true },
  { id: "auto_2", projectId: "proj_1", name: "Dependabot triage", projectName: "Acme Widgets", enabled: true },
  { id: "auto_3", projectId: "proj_2", name: "Gadget release notes", projectName: "Acme Gadgets", enabled: false },
  { id: "auto_4", projectId: "proj_3", name: "Morning inbox", projectName: "Personal", enabled: true },
];

/** What bb lists before any plugin adds a row: its app commands and the Automations page. */
function bbActions(): PaletteAction[] {
  return [
    ...buildAppCommandActions({
      target: null,
      isCommandAvailable: () => true,
      dispatch: noop,
      shortcuts: new Map(),
    }),
    { id: "plugin-page:automations/automations", group: "Plugin pages", title: "Automations", shortcut: null, run: noop },
  ];
}

/** This plugin's rows, as bb lists any plugin's palette action. */
function pluginActions(): PaletteAction[] {
  return paletteRows(AUTOMATIONS).map((row) => ({
    id: `plugin:automation-palette/${row.id}`,
    group: "Plugins",
    title: row.title,
    shortcut: null,
    run: noop,
  }));
}

function Title({ title, positions }: { title: string; positions: readonly number[] }) {
  const emphasized = new Set(positions);
  return (
    <>
      {[...title].map((character, index) =>
        emphasized.has(index) ? (
          <span key={index} className="font-semibold text-foreground">
            {character}
          </span>
        ) : (
          <span key={index}>{character}</span>
        ),
      )}
    </>
  );
}

function QuickPalette({ actions, query }: { actions: PaletteAction[]; query: string }) {
  const ranked: RankedPaletteAction[] = rankPaletteActions({ actions, query, recentIds: [] });
  return (
    <div data-screenshot-frame className="w-fit p-8">
      <div className="w-xl overflow-hidden rounded-lg border bg-background shadow-lg">
        <div className="flex items-center gap-2 border-b px-3">
          <Icon name="Search" className="size-4 shrink-0 text-muted-foreground" />
          <input
            readOnly
            aria-label="Search commands"
            className="h-11 w-full bg-transparent text-sm outline-none"
            value={query}
          />
        </div>
        <div role="listbox" className="max-h-[min(24rem,50dvh)] overflow-y-auto p-1">
          {ranked.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">No matching commands</p>
          ) : (
            ranked.map((entry, index) => (
              <div
                key={entry.action.id}
                role="option"
                aria-selected={index === 0}
                className={`${LAUNCHER_ACTION_ROW_BASE_CLASS} cursor-pointer ${index === 0 ? "bg-state-hover text-foreground" : ""}`}
              >
                <span className="min-w-0 truncate">
                  <Title title={entry.action.title} positions={entry.positions} />
                </span>
                <span className="ml-auto shrink-0 text-muted-foreground">{entry.action.group}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/** Without the plugin, typing "automation" finds only the Automations page, where you open an automation and press Run now. */
export const WithoutThePlugin = () => <QuickPalette actions={bbActions()} query="automation" />;

/** With it, every automation in every project is a row. Selecting one starts it, as its schedule would. A paused automation keeps its row. */
export const WithThePlugin = () => <QuickPalette actions={[...bbActions(), ...pluginActions()]} query="automation" />;

/** Typing a project's name lists that project's automations. */
export const ByProject = () => <QuickPalette actions={[...bbActions(), ...pluginActions()]} query="widgets" />;
