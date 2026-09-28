// bb-plugin-plugin-shelf — frontend entry. One page: the plugins in the
// checkout this plugin was installed from, and their marketplace state.
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { ShelfPage, ShelfRefresh } from "./ui/ShelfPage";

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "mine",
    title: "My plugins",
    icon: "Layers",
    // Routed at /plugins/plugin-shelf/mine; hacks links bb's Plugins sidebar here.
    path: "mine",
    component: ShelfPage,
    headerContent: ShelfRefresh,
  });
});
