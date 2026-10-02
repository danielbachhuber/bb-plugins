import type { DocSnapshot } from "../db.js";
import type { DocSource } from "../sources.js";
import { run } from "./shell.js";

/**
 * Reads each reference doc's text, so the meeting-notes matcher and an agent
 * preparing the journal entry can use it without re-hitting the API. Pulling
 * "open threads" out of them is a judgment call left to the agent.
 */
export async function fetchDocs(
  config: { docs: DocSource[]; fetchDocScript: string },
): Promise<DocSnapshot[]> {
  // Sequential: gws holds a single keyring session, and parallel calls contend on it.
  const out: DocSnapshot[] = [];
  for (const doc of config.docs) {
    try {
      out.push({ id: doc.id, label: doc.label, text: await run(config.fetchDocScript, [doc.id]) });
    } catch (err: any) {
      out.push({ id: doc.id, label: doc.label, error: err?.message ?? String(err) });
    }
  }

  // A per-doc error alone shouldn't fail the source, but every doc failing is an
  // auth or connectivity problem, and the page must not call that "ok".
  const failed = out.filter((doc) => doc.error !== undefined);
  if (failed.length === out.length && out.length > 0) {
    throw new Error(`all ${out.length} docs failed — ${failed[0].error}`);
  }
  return out;
}
