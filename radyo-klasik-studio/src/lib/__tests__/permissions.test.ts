import { describe, expect, it } from "vitest";
import {
  canAccess,
  defaultSectionFor,
  sectionsFor,
} from "@/lib/permissions";

describe("permissions / route guards by role", () => {
  it("admin can access every section", () => {
    for (const s of [
      "dashboard",
      "library",
      "studio",
      "analytics",
      "scheduling",
      "djs",
    ] as const) {
      expect(canAccess("admin", s)).toBe(true);
    }
  });

  it("dj sees studio + library + dashboard + scheduling, not analytics/djs", () => {
    expect(canAccess("dj", "studio")).toBe(true);
    expect(canAccess("dj", "library")).toBe(true);
    expect(canAccess("dj", "dashboard")).toBe(true);
    expect(canAccess("dj", "scheduling")).toBe(true);
    expect(canAccess("dj", "analytics")).toBe(false);
    expect(canAccess("dj", "djs")).toBe(false);
  });

  it("guest is restricted to studio only", () => {
    expect(canAccess("guest", "studio")).toBe(true);
    expect(canAccess("guest", "library")).toBe(false);
    expect(canAccess("guest", "dashboard")).toBe(false);
    expect(canAccess("guest", "analytics")).toBe(false);
  });

  it("no role can access anything", () => {
    expect(canAccess(null, "studio")).toBe(false);
    expect(sectionsFor(null)).toEqual([]);
  });

  it("default landing section is the first allowed section", () => {
    expect(defaultSectionFor("admin")).toBe("dashboard");
    expect(defaultSectionFor("dj")).toBe("dashboard");
    expect(defaultSectionFor("guest")).toBe("studio");
  });
});
