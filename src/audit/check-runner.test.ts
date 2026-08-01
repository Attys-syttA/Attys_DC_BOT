import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readPackageScripts,
  runAuditCheckPipeline,
  type AuditProcessRunner,
} from "./check-runner.js";

const tempRoots: string[] = [];

function makeProject(scripts: Record<string, string>): string {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "attys-audit-runner-"));
  tempRoots.push(projectPath);
  fs.writeFileSync(
    path.join(projectPath, "package.json"),
    `${JSON.stringify({ scripts }, null, 2)}\n`,
    "utf8",
  );
  return projectPath;
}

function fixedNow(...dates: string[]): () => Date {
  let index = 0;
  return () => new Date(dates[Math.min(index++, dates.length - 1)]);
}

describe("audit check runner", () => {
  afterEach(() => {
    for (const tempRoot of tempRoots.splice(0)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("reads package scripts from the target project", () => {
    const projectPath = makeProject({ test: "vitest run" });

    expect(readPackageScripts(projectPath)).toEqual({ test: "vitest run" });
  });

  it("runs only supported fixed catalog checks", async () => {
    const projectPath = makeProject({ test: "vitest run" });
    const runner = vi.fn<AuditProcessRunner>().mockResolvedValue({
      exitCode: 0,
      timedOut: false,
      stopped: false,
      output: "ok\n",
    });

    const results = await runAuditCheckPipeline(projectPath, "tests", {
      runner,
      now: fixedNow("2026-08-01T12:00:00.000Z", "2026-08-01T12:00:02.000Z"),
    });

    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0][0]).toMatchObject({
      name: "tests",
      args: ["test"],
      timeoutMs: 300_000,
    });
    expect(results).toEqual([{
      name: "tests",
      status: "passed",
      exitCode: 0,
      timedOut: false,
      stopped: false,
      publicOutput: "ok",
      startedAt: "2026-08-01T12:00:00.000Z",
      finishedAt: "2026-08-01T12:00:02.000Z",
      durationMs: 2_000,
    }]);
  });

  it("stops a full pipeline on the first unsupported check", async () => {
    const projectPath = makeProject({ "plans:check": "tsx src/cli/plans-check.ts" });
    const runner = vi.fn<AuditProcessRunner>().mockResolvedValue({
      exitCode: 0,
      timedOut: false,
      stopped: false,
      output: "plans ok\n",
    });

    const results = await runAuditCheckPipeline(projectPath, "full", {
      runner,
      now: fixedNow(
        "2026-08-01T12:00:00.000Z",
        "2026-08-01T12:00:01.000Z",
        "2026-08-01T12:00:01.000Z",
        "2026-08-01T12:00:01.000Z",
      ),
    });

    expect(runner).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.status)).toEqual(["passed", "unsupported"]);
    expect(results[1]).toMatchObject({
      name: "lint",
      publicOutput: "missing package script: lint",
    });
  });

  it("sanitizes process output before returning public results", async () => {
    const projectPath = makeProject({ test: "vitest run" });
    const runner = vi.fn<AuditProcessRunner>().mockResolvedValue({
      exitCode: 1,
      timedOut: false,
      stopped: false,
      output: "DISCORD_BOT_TOKEN=abcdefghijklmnopqrstuvwxyz C:\\Users\\someone\\repo 127.0.0.1\n",
    });

    const [result] = await runAuditCheckPipeline(projectPath, "tests", { runner });

    expect(result.status).toBe("failed");
    expect(result.publicOutput).toContain("DISCORD_BOT_TOKEN=<redacted>");
    expect(result.publicOutput).toContain("<local-path>");
    expect(result.publicOutput).toContain("<ip>");
    expect(result.publicOutput).not.toContain("someone");
    expect(result.publicOutput).not.toContain("127.0.0.1");
  });

  it("reports timeout and stop as terminal check results", async () => {
    const projectPath = makeProject({ test: "vitest run", build: "tsup src/index.ts" });
    const runner = vi.fn<AuditProcessRunner>()
      .mockResolvedValueOnce({
        exitCode: null,
        timedOut: true,
        stopped: false,
        output: "slow\n",
      })
      .mockResolvedValueOnce({
        exitCode: null,
        timedOut: false,
        stopped: true,
        output: "stopped\n",
      });

    const timeoutResult = await runAuditCheckPipeline(projectPath, "tests", { runner });
    const stopResult = await runAuditCheckPipeline(projectPath, "build", { runner });

    expect(timeoutResult[0].status).toBe("timed_out");
    expect(stopResult[0].status).toBe("stopped");
  });
});
