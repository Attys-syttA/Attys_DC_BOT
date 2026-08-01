import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeNasControlPlaneStatusFile } from "./control-plane-status-file.js";
import type { NasControlPlaneSnapshot } from "./control-plane-runtime.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attys-nas-status-file-test-"));
  tempDirs.push(dir);
  return dir;
}

function snapshot(): NasControlPlaneSnapshot {
  return {
    controlPlaneName: "attys-dc-bot-nas",
    publicBaseUrl: "",
    buildInfo: {
      sourceCommit: "ebfa22a9abcd",
      packageVersion: "0.1.1-prerelease.2",
      generatedAt: "2026-08-01T19:19:43Z",
      includeSource: true,
    },
    codexExecutionEnabled: false,
    configuredWorkers: [],
    workerHealth: [],
    workerRepoStatus: [],
    workerNamedChecks: [],
    workerStore: {
      storeStatus: "missing",
      workers: [],
    },
    handoffStore: {
      rootStatus: "ready",
      boxes: [],
    },
    checkedAt: "2026-08-01T19:20:00.000Z",
  };
}

describe("NAS control-plane status file", () => {
  it("writes a latest status snapshot atomically", () => {
    const root = makeTempDir();
    const statusPath = path.join(root, "logs", "nas-control-plane-status.json");

    writeNasControlPlaneStatusFile(statusPath, snapshot());

    const parsed = JSON.parse(fs.readFileSync(statusPath, "utf8")) as NasControlPlaneSnapshot;
    expect(parsed.buildInfo.sourceCommit).toBe("ebfa22a9abcd");
    expect(parsed.codexExecutionEnabled).toBe(false);
    expect(fs.readdirSync(path.dirname(statusPath)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("replaces an existing status snapshot", () => {
    const root = makeTempDir();
    const statusPath = path.join(root, "logs", "nas-control-plane-status.json");
    writeNasControlPlaneStatusFile(statusPath, snapshot());

    writeNasControlPlaneStatusFile(statusPath, {
      ...snapshot(),
      checkedAt: "2026-08-01T19:21:00.000Z",
    });

    const parsed = JSON.parse(fs.readFileSync(statusPath, "utf8")) as NasControlPlaneSnapshot;
    expect(parsed.checkedAt).toBe("2026-08-01T19:21:00.000Z");
  });
});
