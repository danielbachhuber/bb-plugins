import { describe, expect, it } from "vitest";
import { GhUnavailableError, type GhRunner } from "@danielb/gh-shared/gh";
import { createGh } from "./gh.js";

const ref = { repo: "acme/widgets", number: 12 };

function runner(answer: (args: string[]) => string | Error): GhRunner & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    async run(args) {
      calls.push(args);
      const result = answer(args);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

describe("issue", () => {
  it("reads the title and state", async () => {
    const gh = createGh(runner(() => JSON.stringify({ title: "Widgets drift", state: "OPEN" })));
    expect(await gh.issue(ref)).toEqual({ title: "Widgets drift", state: "open" });
  });

  it("asks gh once within the cache window, and again after it", async () => {
    let clock = 0;
    const fake = runner(() => JSON.stringify({ title: "Widgets drift", state: "CLOSED" }));
    const gh = createGh(fake, () => clock);
    await gh.issue(ref);
    await gh.issue(ref);
    expect(fake.calls).toHaveLength(1);
    clock = 6 * 60_000;
    await gh.issue(ref);
    expect(fake.calls).toHaveLength(2);
  });

  it("returns null instead of throwing when gh is missing or fails", async () => {
    const missing = createGh(runner(() => new GhUnavailableError("`gh` was not found", "")));
    expect(await missing.issue(ref)).toBeNull();
    const garbled = createGh(runner(() => "not json"));
    expect(await garbled.issue(ref)).toBeNull();
  });

  it("remembers a failure for a minute, not five", async () => {
    let clock = 0;
    const fake = runner(() => new Error("network"));
    const gh = createGh(fake, () => clock);
    await gh.issue(ref);
    clock = 30_000;
    await gh.issue(ref);
    expect(fake.calls).toHaveLength(1);
    clock = 61_000;
    await gh.issue(ref);
    expect(fake.calls).toHaveLength(2);
  });
});

describe("pullRequest", () => {
  it("reads state, body, and closing references", async () => {
    const gh = createGh(
      runner(() =>
        JSON.stringify({
          title: "Promote widgets into core",
          url: "https://github.com/acme/widgets/pull/128",
          body: "Part of #7",
          state: "OPEN",
          isDraft: false,
          closingIssuesReferences: [
            { number: 12, repository: { name: "Widgets", owner: { login: "Acme" } } },
          ],
        }),
      ),
    );
    expect(await gh.pullRequest({ repo: "acme/widgets", number: 128 })).toEqual({
      title: "Promote widgets into core",
      url: "https://github.com/acme/widgets/pull/128",
      body: "Part of #7",
      state: "open",
      closing: [{ repo: "acme/widgets", number: 12 }],
    });
  });

  it("maps draft, merged, and closed", async () => {
    const shaped = (fields: object) =>
      createGh(runner(() => JSON.stringify({ title: "t", url: "u", ...fields }))).pullRequest(ref);
    expect((await shaped({ state: "OPEN", isDraft: true }))?.state).toBe("draft");
    expect((await shaped({ state: "MERGED" }))?.state).toBe("merged");
    expect((await shaped({ state: "CLOSED" }))?.state).toBe("closed");
  });

  it("passes arguments as an array, never a shell string", async () => {
    const fake = runner(() => JSON.stringify({ title: "t", url: "u", state: "OPEN" }));
    await createGh(fake).pullRequest({ repo: "acme/widgets", number: 128 });
    expect(fake.calls[0]).toEqual([
      "pr",
      "view",
      "128",
      "--repo",
      "acme/widgets",
      "--json",
      "title,url,body,state,isDraft,closingIssuesReferences",
    ]);
  });
});

