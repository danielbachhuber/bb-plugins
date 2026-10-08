import { describe, expect, it } from "vitest";

import { pageOf } from "./paging";

describe("pageOf", () => {
  it("describes the first page of several", () => {
    expect(pageOf(118, 0, 25)).toEqual({ page: 0, pages: 5, from: 1, to: 25, offset: 0 });
  });

  it("describes a middle page", () => {
    expect(pageOf(118, 2, 25)).toEqual({ page: 2, pages: 5, from: 51, to: 75, offset: 50 });
  });

  it("stops the last page at the total", () => {
    expect(pageOf(118, 4, 25)).toEqual({ page: 4, pages: 5, from: 101, to: 118, offset: 100 });
  });

  it("clamps a page past the end, so a shorter period does not land on nothing", () => {
    expect(pageOf(30, 9, 25)).toEqual({ page: 1, pages: 2, from: 26, to: 30, offset: 25 });
  });

  it("clamps a negative page", () => {
    expect(pageOf(30, -2, 25)).toMatchObject({ page: 0, from: 1 });
  });

  it("counts one page when everything fits", () => {
    expect(pageOf(25, 0, 25)).toEqual({ page: 0, pages: 1, from: 1, to: 25, offset: 0 });
  });

  it("reports an empty list as one page with nothing on it", () => {
    expect(pageOf(0, 0, 25)).toEqual({ page: 0, pages: 1, from: 0, to: 0, offset: 0 });
  });
});
