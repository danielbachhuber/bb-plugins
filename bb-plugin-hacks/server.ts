// bb-plugin-hacks — backend entry.
//
// Most hacks are frontend content scripts that keep their state in the
// browser. The one exception is the checkout indicator, which needs git, so
// this serves its RPC.
import { existsSync } from "node:fs";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { rpcContract } from "./hacks/checkout-sync/contract";
import { createCheckoutSync, runGit } from "./hacks/checkout-sync/git";
import type { ProjectCheckout } from "./hacks/checkout-sync/rules";

export default async function plugin(bb: BbPluginApi) {
  bb.log.info("loaded");

  const sync = createCheckoutSync(runGit, Date.now, (message) =>
    bb.log.warn(`checkout-sync: ${message}`),
  );

  /**
   * The project's name and its checkout on this machine. A project can list a
   * path on each of several machines; the one that exists here is the one
   * this server can run git in, and the default wins if two do.
   */
  async function locate(projectId: string): Promise<{ name: string; path: string | null } | null> {
    try {
      const project = await bb.sdk.projects.get({ projectId });
      const here = project.sources.filter(
        (source) => source.type === "local_path" && existsSync(source.path),
      );
      const path = (here.find((source) => source.isDefault) ?? here[0])?.path ?? null;
      return { name: project.name, path };
    } catch (error) {
      bb.log.warn(`checkout-sync: could not read project ${projectId}: ${String(error)}`);
      return null;
    }
  }

  async function checkout(
    projectId: string,
    run: (path: string) => ReturnType<typeof sync.status>,
  ): Promise<ProjectCheckout | null> {
    const project = await locate(projectId);
    if (project === null) return null;
    if (project.path === null) return { name: project.name, status: null };
    try {
      return { name: project.name, status: await run(project.path) };
    } catch (error) {
      bb.log.warn(`checkout-sync: git failed in ${project.path}: ${String(error)}`);
      return { name: project.name, status: null };
    }
  }

  bb.rpc.register(rpcContract, {
    async checkout_status({ projectIds }) {
      const entries = await Promise.all(
        [...new Set(projectIds)].map(
          async (id) => [id, await checkout(id, (path) => sync.status(path))] as const,
        ),
      );
      const result: Record<string, ProjectCheckout> = {};
      for (const [id, value] of entries) if (value !== null) result[id] = value;
      return result;
    },
    async checkout_pull({ projectId }) {
      const value = await checkout(projectId, (path) => sync.pull(path));
      if (value === null) throw new Error(`No project ${projectId}`);
      return value;
    },
  });

  bb.onDispose(() => {
    bb.log.info("disposed");
  });
}
