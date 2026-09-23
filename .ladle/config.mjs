import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Ladle runs from bb's app directory (see scripts/ladle.mjs). It joins story
// paths, and the output directory, onto that directory, so both have to be
// relative to it.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fromBbApp = relative(process.cwd(), repoRoot);

/** @type {import("@ladle/react").UserConfig} */
export default {
  stories: `${fromBbApp}/{bb-plugin-*,gh-shared}/**/*.stories.tsx`,
  defaultStory: "",
  outDir: `${fromBbApp}/build`,
  addons: {
    theme: {
      defaultState: "dark",
    },
  },
};
