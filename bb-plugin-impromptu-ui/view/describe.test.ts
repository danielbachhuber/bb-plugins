import { describe, expect, it } from "vitest";
import { viewJsonSchema } from "./describe.js";

type Node = {
  description?: string;
  $ref?: string;
  const?: unknown;
  properties?: Record<string, Node>;
  items?: Node;
  anyOf?: Node[];
  oneOf?: Node[];
  $defs?: Record<string, Node>;
};

/** Every field without a description, as a path, so a new field cannot reach agents unexplained. */
function undescribed(root: Node): string[] {
  const missing: string[] = [];
  const resolve = (node: Node): Node => (node.$ref === undefined ? node : root.$defs![node.$ref.replace("#/$defs/", "")]!);
  const seen = new Set<Node>();
  const walk = (node: Node, path: string) => {
    node = resolve(node);
    if (seen.has(node)) return;
    seen.add(node);
    for (const [key, child] of Object.entries(node.properties ?? {})) {
      // A union's `type` names the variant, which carries the description.
      if (child.const === undefined && child.description === undefined && resolve(child).description === undefined) {
        missing.push(`${path}.${key}`);
      }
      walk(child, `${path}.${key}`);
    }
    if (node.items !== undefined) walk(node.items, `${path}[]`);
    for (const variant of [...(node.anyOf ?? []), ...(node.oneOf ?? [])]) walk(variant, path);
  };
  walk(root, "view");
  return missing;
}

describe("viewJsonSchema", () => {
  it("describes the view file publish accepts", () => {
    const schema = JSON.parse(viewJsonSchema());
    expect(schema.type).toBe("object");
    expect(schema.required).toContain("title");
    expect(Object.keys(schema.properties)).toContain("sections");
  });

  it("explains every field", () => {
    expect(undescribed(JSON.parse(viewJsonSchema()))).toEqual([]);
  });
});
