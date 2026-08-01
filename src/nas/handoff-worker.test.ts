import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AuditCheckRunResult } from "../audit/check-runner.js";
import { createAuditRequestHandoff } from "./audit-handoff.js";
import {
  readHandoffEnvelope,
  writeHandoffEnvelope,
} from "./handoff-store.js";
import { processQueuedHandoffOnce } from "./handoff-worker.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attys-handoff-worker-test-"));
  tempDirs.push(dir);
  return dir;
}

function passedResult(): AuditCheckRunResult {
  return {
    name: "plans",
    status: "passed",
    exitCode: 0,
    timedOut: false,
    stopped: false,
    publicOutput: "plans ok",
    startedAt: "2026-08-01T12:00:00.000Z",
    finishedAt: "2026-08-01T12:00:01.000Z",
    durationMs: 1000,
  };
}

describe("handoff worker", () => {
  it("processes queued audit requests into public-safe outbox results", async () => {
    const root = makeTempDir();
    const workspaceRoot = makeTempDir();
    fs.mkdirSync(path.join(workspaceRoot, "Attys_DC_BOT"));
    const request = createAuditRequestHandoff({
      requestId: "request-1",
      projectLabel: "Attys_DC_BOT",
      checkName: "plans",
    }, new Date("2026-08-01T12:00:00.000Z"));
    writeHandoffEnvelope(root, "inbox", request);

    const result = await processQueuedHandoffOnce({
      handoffRoot: root,
      workspaceRoot,
      runCheck: async () => [passedResult()],
      now: () => new Date("2026-08-01T12:01:00.000Z"),
    });

    expect(result).toEqual({
      processed: 1,
      skipped: 0,
      outboxIds: ["result-request-1"],
      archivedIds: ["request-1"],
    });
    expect(fs.existsSync(path.join(root, "inbox", "request-1.json"))).toBe(false);
    expect(fs.existsSync(path.join(root, "archive", "request-1.json"))).toBe(true);
    expect(readHandoffEnvelope(path.join(root, "outbox", "result-request-1.json"))).toMatchObject({
      type: "audit.result",
      status: "completed",
      publicFields: {
        check: "plans",
        project: "Attys_DC_BOT",
        request: "request-1",
        result: "passed",
        summary: "1/1 passed",
      },
    });
  });
});
