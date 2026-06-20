import { describe, expect, it } from "vitest";
import { summarizeRegisteredCommandNames } from "./command-surface.js";

describe("command surface registration summaries", () => {
  it("reports exact command registration parity", () => {
    expect(summarizeRegisteredCommandNames(["ask", "status"], ["ask", "status"])).toEqual([
      "OK application command registration 2/2",
    ]);
  });

  it("reports missing and extra application commands without ids or paths", () => {
    const lines = summarizeRegisteredCommandNames(["ask", "legacy"], ["ask", "status", "health", "Send to Codex"]);

    expect(lines).toEqual([
      "INFO application command registration 2/4",
      "FAIL missing application commands: /health, \"send to codex\", /status",
      "INFO extra application commands: /legacy",
    ]);
    expect(lines.join("\n")).not.toContain(":\\");
  });
});
