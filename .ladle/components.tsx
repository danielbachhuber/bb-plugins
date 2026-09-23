// bb's own story wrapper: theme toggle, toaster, tooltips, router, query
// client. Stories here render inside exactly what bb's stories render inside.
import type { GlobalProvider } from "@ladle/react";
import { Provider as BbProvider } from "./bb-source/apps/app/.ladle/components";
import "./ladle.css";

// Ladle finds the Provider by parsing for `export const Provider`, so a
// re-export (`export { Provider } from ...`) silently breaks every story.
export const Provider: GlobalProvider = BbProvider;
