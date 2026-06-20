import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  statSync: vi.fn(),
  readFileSync: vi.fn(),
  loadCodexUsageCache: vi.fn(),
  runLocalCommand: vi.fn(),
  readOperatorStartupLog: vi.fn(),
  operatorToolsStatusFromLog: vi.fn(),
  readOperatorEvents: vi.fn(),
  describeOperatorEventLine: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    statSync: mocks.statSync,
    readFileSync: mocks.readFileSync,
  },
}));

vi.mock("../../codex/usage.js", () => ({
  loadCodexUsageCache: mocks.loadCodexUsageCache,
}));

vi.mock("./local-command.js", () => ({
  runLocalCommand: mocks.runLocalCommand,
}));

vi.mock("./tools.js", () => ({
  readOperatorStartupLog: mocks.readOperatorStartupLog,
  operatorToolsStatusFromLog: mocks.operatorToolsStatusFromLog,
}));

vi.mock("../operator-events.js", () => ({
  readOperatorEvents: mocks.readOperatorEvents,
  describeOperatorEventLine: mocks.describeOperatorEventLine,
}));

import { buildHealthReport, formatHealthAge, parseAheadBehind } from "./health.js";

describe("/health helpers", () => {
  it("formats usage cache age", () => {
    expect(formatHealthAge(1_000_000, 1_000_100)).toBe("just now");
    expect(formatHealthAge(1_000_000, 1_300_000)).toBe("5m ago");
    expect(formatHealthAge(1_000_000, 8_200_000)).toBe("2h ago");
  });

  it("parses git ahead and behind counts", () => {
    expect(parseAheadBehind("0\t0")).toEqual({ behind: 0, ahead: 0 });
    expect(parseAheadBehind("2 1")).toEqual({ behind: 2, ahead: 1 });
    expect(parseAheadBehind("not counts")).toBeNull();
  });
});

describe("/health report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.statSync.mockReturnValue({ size: 0 });
    mocks.readFileSync.mockReturnValue(JSON.stringify({ version: "0.1.0" }));
    mocks.loadCodexUsageCache.mockReturnValue({ fetchedAt: Date.now(), usage: { buckets: [] } });
    mocks.readOperatorStartupLog.mockReturnValue(["2026-06-20T18:00:00 OK: operator tools preflight completed."]);
    mocks.operatorToolsStatusFromLog.mockReturnValue("ready");
    mocks.readOperatorEvents.mockReturnValue(["2026-06-20T18:00:00.000Z lifecycle session-new channel=<#12345>"]);
    mocks.describeOperatorEventLine.mockReturnValue("lifecycle session-new channel=<#12345>");
    mocks.runLocalCommand
      .mockResolvedValueOnce({ exitCode: 0, timedOut: false, output: "main\n" })
      .mockResolvedValueOnce({ exitCode: 0, timedOut: false, output: "" })
      .mockResolvedValueOnce({ exitCode: 0, timedOut: false, output: "0\t0\n" });
  });

  it("builds a public-safe runtime report", async () => {
    const report = await buildHealthReport("E:\\private\\repo");

    expect(report).toContain("Attys DC BOT Health");
    expect(report).toContain("OK bot process");
    expect(report).toContain("OK bot version: 0.1.0");
    expect(report).toContain("OK slash command surface:");
    expect(report).toContain("OK bot error log: empty");
    expect(report).toContain("OK operator tools: ready");
    expect(report).toContain("INFO latest operator event: lifecycle session-new channel=<#12345>");
    expect(report).toContain("OK Codex usage cache");
    expect(report).toContain("OK bot repo branch: main");
    expect(report).toContain("OK bot repo sync: origin/main parity");
    expect(report).toContain("OK bot repo worktree: clean");
    expect(report).not.toContain("private");
  });

  it("reports local changes and unavailable sync counts", async () => {
    mocks.statSync.mockReturnValue({ size: 128 });
    mocks.loadCodexUsageCache.mockReturnValue(null);
    mocks.operatorToolsStatusFromLog.mockReturnValue("failed");
    mocks.readOperatorEvents.mockReturnValue([]);
    mocks.runLocalCommand
      .mockReset()
      .mockResolvedValueOnce({ exitCode: 0, timedOut: false, output: "feature/test\n" })
      .mockResolvedValueOnce({ exitCode: 0, timedOut: false, output: " M src/file.ts\n" })
      .mockResolvedValueOnce({ exitCode: 1, timedOut: false, output: "" });

    const report = await buildHealthReport("E:\\private\\repo");

    expect(report).toContain("INFO bot error log: has content");
    expect(report).toContain("FAIL operator tools: failed");
    expect(report).toContain("INFO latest operator event: none");
    expect(report).toContain("INFO Codex usage cache: missing or unreadable");
    expect(report).toContain("INFO bot repo sync: upstream count unavailable");
    expect(report).toContain("INFO bot repo worktree: local changes present");
    expect(report).not.toContain("E:\\private\\repo");
  });
});
