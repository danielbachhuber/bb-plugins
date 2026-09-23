// bb's Ladle Vite config, plus what it takes to render this checkout's files.
// scripts/ladle.mjs sets BB_SOURCE_DIR and BB_PLUGINS_DIR and links
// ./bb-source to the bb checkout before Ladle loads this.
import { existsSync, lstatSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Plugin, UserConfig } from "vite";
import bbConfig from "./bb-source/apps/app/.ladle/vite.config";

const bbSourceDir = process.env.BB_SOURCE_DIR;
const pluginsDir = process.env.BB_PLUGINS_DIR;
if (!bbSourceDir || !pluginsDir) {
  throw new Error("Run Ladle through `npm run storybook`, which sets BB_SOURCE_DIR.");
}
const bbAppDir = path.join(bbSourceDir, "apps/app");
const bbAppSrc = `${path.join(bbAppDir, "src")}/`;

/** The directory of the package.json nearest to a file. */
function packageRoot(file: string): string | null {
  for (let dir = path.dirname(file); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
  }
  return null;
}

const EXTENSIONS = ["", ".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts"];

function existingFile(target: string): string | null {
  for (const extension of EXTENSIONS) {
    const candidate = `${target}${extension}`;
    if (existsSync(candidate) && !lstatSync(candidate).isDirectory()) return candidate;
  }
  return null;
}

/**
 * `@/` means two things in one page. bb's app source and stylesheet use it
 * for apps/app/src, and bb's own alias says so; Tailwind resolves bb's CSS
 * imports through that alias, so it stays exactly as bb has it. Every plugin
 * here uses `@/` for its own directory (each tsconfig maps `@/*` to `./*`).
 *
 * Vite's alias runs before any plugin, so this cannot see `@/` itself. It sees
 * what the alias turned it into, a path under apps/app/src, and sends it back
 * to the importing plugin's directory when the importer is not bb's.
 */
function pluginAtImports(): Plugin {
  return {
    name: "bb-plugins:at-imports",
    enforce: "pre",
    resolveId(id, importer) {
      if (!id.startsWith(bbAppSrc) || !importer) return null;
      const file = importer.split("?")[0]!;
      if (file.startsWith(`${bbSourceDir}/`)) return null;
      const base = packageRoot(file);
      return base ? existingFile(path.join(base, id.slice(bbAppSrc.length))) : null;
    },
  };
}

/**
 * Ladle means to reload when a story file is added or removed, but it hands
 * its glob to a chokidar that no longer accepts globs, so a new story stays
 * "not found" until a restart. This watches this checkout's directories and
 * does what Ladle's watcher would have.
 */
function newStoryFiles(): Plugin {
  return {
    name: "bb-plugins:new-story-files",
    configureServer(server) {
      for (const entry of readdirSync(pluginsDir!, { withFileTypes: true })) {
        if (entry.isDirectory() && /^(bb-plugin-|gh-shared$)/.test(entry.name)) {
          server.watcher.add(path.join(pluginsDir!, entry.name));
        }
      }
      const onChange = (file: string) => {
        if (!file.endsWith(".stories.tsx") || !file.startsWith(`${pluginsDir}/`)) return;
        const list = server.moduleGraph.getModuleById("\0virtual:generated-list");
        if (list) server.moduleGraph.invalidateModule(list);
        server.ws.send({ type: "full-reload", path: "*" });
      };
      server.watcher.on("add", onChange).on("unlink", onChange);
    },
  };
}

// Through the bb-source link rather than the real path, so a story's own
// `@bb-app/...` import does not look like a plugin's `@/` to the plugin above.
const bbAppViaLink = path.join(pluginsDir, ".ladle/bb-source/apps/app");

const config: UserConfig = {
  ...bbConfig,
  plugins: [pluginAtImports(), newStoryFiles(), ...(bbConfig.plugins ?? [])],
  // Kept apart from bb's own Ladle cache so the two can run side by side.
  cacheDir: "node_modules/.vite/bb-plugins-ladle",
  resolve: {
    ...bbConfig.resolve,
    alias: {
      ...(bbConfig.resolve?.alias as Record<string, string>),
      // For stories that render bb's own components beside a plugin's.
      "@bb-app": path.join(bbAppViaLink, "src"),
      "@bb-ladle": path.join(bbAppViaLink, ".ladle"),
    },
  },
  server: {
    ...bbConfig.server,
    fs: { allow: [bbSourceDir, pluginsDir] },
  },
};

export default config;
