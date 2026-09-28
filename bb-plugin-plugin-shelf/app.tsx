// bb-plugin-plugin-shelf — frontend entry. One page, the plugins in the
// checkout this plugin was installed from and their marketplace state, shown
// both as its own page and inside bb's Plugins screen.
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { PluginsScreenOverlay } from "./ui/PluginsScreenOverlay";
import { ShelfPage, ShelfRefresh } from "./ui/ShelfPage";

/** The standalone page, which has bb's title bar for its Refresh button. */
function ShelfNavPage() {
  return <ShelfPage />;
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "mine",
    title: "My plugins",
    icon: "Layers",
    // Routed at /plugins/plugin-shelf/mine.
    path: "mine",
    component: ShelfNavPage,
    headerContent: ShelfRefresh,
  });

  // The same page at /plugins?view=mine, with a My plugins row in bb's
  // Plugins sidebar that opens it.
  app.slots.experimental_appOverlay({
    id: "plugins-screen",
    component: PluginsScreenOverlay,
  });
});
