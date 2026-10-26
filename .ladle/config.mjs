import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Ladle runs from bb's app directory (see scripts/ladle.mjs). It joins story
// paths, and the output directory, onto that directory, so both have to be
// relative to it.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fromBbApp = relative(process.cwd(), repoRoot);

/** @type {import("@ladle/react").UserConfig} */
export default {
  stories: [
    `${fromBbApp}/{bb-plugin-*,gh-shared,sweep-ui,component-library}/**/*.stories.tsx`,
    // Keeps the glob out of each plugin's own node_modules, where a nested
    // package could carry stories, and two copies of one story is an error
    // that blanks every story.
    `!${fromBbApp}/**/node_modules/**`,
    // A capture without --explore leaves out the stories in explore/
    // directories, which git ignores and nobody keeps building against bb's
    // latest components, so a stale one cannot stop the build.
    ...(process.env.BB_PLUGINS_SKIP_EXPLORE ? [`!${fromBbApp}/**/explore/**`] : []),
  ],
  defaultStory: "",
  outDir: `${fromBbApp}/build`,
  addons: {
    theme: {
      defaultState: "dark",
    },
  },
};
