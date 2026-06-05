import { describe, expect, it } from "vitest";
import { reorder } from "@/lib/array";

describe("reorder", () => {
  it("moves an item forward", () => {
    expect(reorder(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });
  it("moves an item backward", () => {
    expect(reorder(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });
  it("is a no-op for equal indices or out-of-range", () => {
    expect(reorder(["a", "b"], 1, 1)).toEqual(["a", "b"]);
    expect(reorder(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
});
