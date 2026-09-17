// bb-plugin-hacks — backend entry.
//
// Deliberately empty of behavior. Every hack in this plugin is a frontend
// content script that keeps its state in the browser, so there is nothing to
// persist or serve here; bb requires a `bb.server` entry, so this is it.
import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default async function plugin(bb: BbPluginApi) {
  bb.log.info("loaded");

  bb.onDispose(() => {
    bb.log.info("disposed");
  });
}
