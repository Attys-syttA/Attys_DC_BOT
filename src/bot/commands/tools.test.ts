import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildToolsReply,
  operatorToolsStatusFromLog,
  operatorToolsStatusFromExit,
  readOperatorStartupLog,
} from "./tools.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attys-tools-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("tools command helpers", () => {
  it("maps operator startup exit codes to public statuses", () => {
    expect(operatorToolsStatusFromExit(0, false)).toBe("ready");
    expect(operatorToolsStatusFromExit(1, false)).toBe("failed");
    expect(operatorToolsStatusFromExit(2, false)).toBe("skipped");
    expect(operatorToolsStatusFromExit(3, false)).toBe("running");
    expect(operatorToolsStatusFromExit(null, false)).toBe("failed");
    expect(operatorToolsStatusFromExit(0, true)).toBe("failed");
  });

  it("reads only public-safe operator startup status lines", () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "operator-startup.log"), [
      "2026-06-20T17:45:23 START: operator tools preflight.",
      "private path: C:\\Users\\someone\\secret",
      "2026-06-20T17:45:23 RUNNING: operator tools preflight already active.",
      "2026-06-20T17:45:24 OK: operator tools preflight completed.",
    ].join("\n"));

    expect(readOperatorStartupLog(dir)).toEqual([
      "2026-06-20T17:45:23 START: operator tools preflight.",
      "2026-06-20T17:45:23 RUNNING: operator tools preflight already active.",
      "2026-06-20T17:45:24 OK: operator tools preflight completed.",
    ]);
  });

  it("keeps only the latest public-safe operator startup status lines", () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, "operator-startup.log"), [
      "2026-06-20T17:45:20 START: operator tools preflight.",
      "2026-06-20T17:45:21 OK: operator tools preflight completed.",
      "2026-06-20T17:45:22 START: operator tools preflight.",
      "2026-06-20T17:45:23 OK: operator tools preflight completed.",
      "2026-06-20T17:45:24 START: operator tools preflight.",
      "2026-06-20T17:45:25 OK: operator tools preflight completed.",
    ].join("\n"));

    expect(readOperatorStartupLog(dir)).toEqual([
      "2026-06-20T17:45:22 START: operator tools preflight.",
      "2026-06-20T17:45:23 OK: operator tools preflight completed.",
      "2026-06-20T17:45:24 START: operator tools preflight.",
      "2026-06-20T17:45:25 OK: operator tools preflight completed.",
    ]);
  });

  it("maps the latest public-safe log status", () => {
    expect(operatorToolsStatusFromLog([
      "2026-06-20T17:45:23 START: operator tools preflight.",
      "2026-06-20T17:45:24 OK: operator tools preflight completed.",
    ])).toBe("ready");
    expect(operatorToolsStatusFromLog([
      "2026-06-20T17:45:23 RUNNING: operator tools preflight already active.",
    ])).toBe("running");
    expect(operatorToolsStatusFromLog([
      "2026-06-20T17:45:23 FAILED: operator tools preflight exit=1",
    ])).toBe("failed");
    expect(operatorToolsStatusFromLog([])).toBe("skipped");
  });

  it("builds a concise ready reply", () => {
    const reply = buildToolsReply("ready", ["2026-06-20T17:45:24 OK: operator tools preflight completed."]);

    expect(reply).toContain("Operator tools ready");
    expect(reply).toContain("operator tools preflight completed");
  });

  it("builds a concise running reply", () => {
    const reply = buildToolsReply("running", ["2026-06-20T17:45:23 RUNNING: operator tools preflight already active."]);

    expect(reply).toContain("Operator tools already running");
    expect(reply).toContain("did not start a duplicate run");
  });
});
