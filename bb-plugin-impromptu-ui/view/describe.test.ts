import { describe, expect, it } from "vitest";
import { viewJsonSchema } from "./describe.js";

describe("viewJsonSchema", () => {
  it("describes the view file publish accepts", () => {
    const schema = JSON.parse(viewJsonSchema());
    expect(schema.type).toBe("object");
    expect(schema.required).toContain("title");
    expect(Object.keys(schema.properties)).toContain("sections");
  });
});
