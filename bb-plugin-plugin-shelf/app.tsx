// bb-plugin-plugin-shelf — frontend entry. One page, the plugins in the
// checkout this plugin was installed from and their marketplace state, shown
// inside bb's Plugins screen with a My plugins row in that screen's sidebar.
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { PluginsScreenOverlay } from "./ui/PluginsScreenOverlay";

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({
    id: "plugins-screen",
    component: PluginsScreenOverlay,
  });
});
