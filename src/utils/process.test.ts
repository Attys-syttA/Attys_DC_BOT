import { describe, expect, it, vi } from "vitest";
import { windowsCmdInvocation } from "./process.js";

describe("windowsCmdInvocation", () => {
  it("keeps bare .cmd executable names unquoted for cmd /c", () => {
    vi.stubGlobal("process", {
      ...process,
      platform: "win32",
    });

    expect(windowsCmdInvocation("npm.cmd", ["run", "plans:check"])).toEqual({
      command: "cmd.exe",
      args: ["/d", "/c", "npm.cmd", "run", "plans:check"],
    });

    vi.unstubAllGlobals();
  });

  it("quotes .cmd executable paths when a path separator or space is present", () => {
    vi.stubGlobal("process", {
      ...process,
      platform: "win32",
    });

    expect(windowsCmdInvocation("C:\\Program Files\\nodejs\\npm.cmd", ["test"])).toEqual({
      command: "cmd.exe",
      args: ["/d", "/c", "C:\\Program Files\\nodejs\\npm.cmd", "test"],
    });

    vi.unstubAllGlobals();
  });
});
