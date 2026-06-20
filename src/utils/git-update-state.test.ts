import { describe, expect, it } from "vitest";
import { decideSafeUpdate, parseAheadBehind } from "./git-update-state.js";

describe("git update state helpers", () => {
  it("parses ahead/behind counts from git rev-list output", () => {
    expect(parseAheadBehind("0\t3")).toEqual({ ahead: 0, behind: 3 });
    expect(parseAheadBehind("2 0")).toEqual({ ahead: 2, behind: 0 });
    expect(parseAheadBehind("bad")).toBeNull();
    expect(parseAheadBehind("-1 0")).toBeNull();
  });

  it("allows safe update only for clean behind-only repositories", () => {
    expect(decideSafeUpdate({ dirty: false, ahead: 0, behind: 2 })).toEqual({
      canSafeUpdate: true,
      status: "behind",
      detail: "behind 2; fast-forward safe update is allowed",
    });
  });

  it("blocks dirty, ahead, diverged, and synced states", () => {
    expect(decideSafeUpdate({ dirty: true, ahead: 0, behind: 2 }).status).toBe("dirty");
    expect(decideSafeUpdate({ dirty: false, ahead: 1, behind: 0 }).status).toBe("ahead");
    expect(decideSafeUpdate({ dirty: false, ahead: 1, behind: 1 }).status).toBe("diverged");
    expect(decideSafeUpdate({ dirty: false, ahead: 0, behind: 0 }).status).toBe("clean");
  });
});
