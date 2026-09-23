// bb-plugin-hacks — frontend entry.
//
// This plugin has no React slot and no panel. Every hack in it is a content
// script that patches bb's own app shell, which is what the SDK sanctions for
// decorating existing app-shell DOM. This file is wiring only: each hack under
// hacks/ exports its own `id` and `mount`, and the behavior lives there so it
// can be tested under jsdom.
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import * as gitDiffExpandUnviewed from "./hacks/git-diff-expand-unviewed";
import * as gitDiffViewPreferences from "./hacks/git-diff-view-preferences";
import * as projectOpenInEditor from "./hacks/project-open-in-editor";

const HACKS = [
  gitDiffExpandUnviewed,
  gitDiffViewPreferences,
  projectOpenInEditor,
];

export default definePluginApp((app) => {
  for (const hack of HACKS) {
    app.contentScripts.register({
      id: hack.id,
      mount({ signal }) {
        return hack.mount(signal);
      },
    });
  }
});
