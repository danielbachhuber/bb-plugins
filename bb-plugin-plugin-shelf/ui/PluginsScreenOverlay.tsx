// Draws the My plugins page inside bb's own Plugins screen. bb has no slot for
// a page there, so this app overlay (mounted once per window, inside bb's
// React tree) portals the page into the screen's main panel, and
// screen/engine.ts does the DOM work around it: the sidebar row, and hiding
// bb's page while this one is shown.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { startScreenEngine } from "../screen/engine";
import { ShelfPage } from "./ShelfPage";

declare const __BB_PLUGIN_ID__: string | undefined;

export function PluginsScreenOverlay() {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    startScreenEngine({
      signal: controller.signal,
      doc: document,
      location: () => window.location,
      defer: (run) => {
        const frame = window.requestAnimationFrame(run);
        return () => window.cancelAnimationFrame(frame);
      },
      // bb uses a browser router, which listens for popstate. Pushing the
      // path and announcing it keeps the navigation in-app, without a reload.
      navigate(to) {
        window.history.pushState({}, "", to);
        window.dispatchEvent(new PopStateEvent("popstate"));
      },
      onPanel: setContainer,
    });
    return () => controller.abort();
  }, []);

  // bb scopes a plugin's stylesheet to elements under [data-bb-plugin], and a
  // portal leaves that subtree, so the page has to name the plugin itself.
  return container === null
    ? null
    : createPortal(
        <div data-bb-plugin={typeof __BB_PLUGIN_ID__ === "string" ? __BB_PLUGIN_ID__ : undefined}>
          <ShelfPage />
        </div>,
        container,
      );
}
