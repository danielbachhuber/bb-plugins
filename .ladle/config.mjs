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
    `${fromBbApp}/{bb-plugin-*,gh-shared}/**/*.stories.tsx`,
    // A plugin that depends on another installs a copy of it, stories and
    // all, and two copies of one story is an error that blanks every story.
    `!${fromBbApp}/**/node_modules/**`,
  ],
  defaultStory: "",
  outDir: `${fromBbApp}/build`,
  addons: {
    theme: {
      defaultState: "dark",
    },
  },
};
