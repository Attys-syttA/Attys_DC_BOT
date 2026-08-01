import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseNasControlPlaneConfig } from "./control-plane-config.js";
import {
  buildNasControlPlaneSnapshot,
  readNasControlPlaneBuildInfo,
} from "./control-plane-runtime.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attys-nas-runtime-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("NAS control-plane runtime", () => {
  it("builds a public-safe status snapshot without executing Codex", async () => {
    const root = makeTempDir();
    const config = parseNasControlPlaneConfig({
      ATTYS_NAS_CONTROL_PLANE_NAME: "Home NAS",
      ATTYS_NAS_WORKERS_JSON: JSON.stringify([{
        id: "otthon",
        label: "Otthoni Worker",
        baseUrl: "http://worker-home.example.invalid:8787",
        sharedSecretEnv: "ATTYS_WORKER_SHARED_SECRET_HOME",
        workspaceRootLabel: "E:\\codex_works",
      }]),
    });

    const snapshot = await buildNasControlPlaneSnapshot(config, {
      workerStorePath: path.join(root, "data", "workers.json"),
      handoffRoot: path.join(root, "data", "handoff"),
      buildInfoPath: path.join(root, "NAS_BUILD_INFO.json"),
    }, {
      now: () => new Date("2026-08-01T12:00:00.000Z"),
      probeWorkersHealth: async () => [{
        workerId: "otthon",
        ok: true,
        statusCode: 200,
        summary: "worker health ready",
      }],
      readWorkersRepoStatus: async () => [{
        workerId: "otthon",
        ok: true,
        statusCode: 200,
        project: "Attys_DC_BOT",
        branch: "main",
        clean: true,
        summary: "clean",
      }],
    });

    expect(snapshot).toEqual({
      controlPlaneName: "home-nas",
      publicBaseUrl: "",
      buildInfo: {
        sourceCommit: "unknown",
        packageVersion: "unknown",
        generatedAt: "unknown",
        includeSource: false,
      },
      codexExecutionEnabled: false,
      configuredWorkers: [{
        id: "otthon",
        label: "Otthoni Worker",
        baseUrl: "http://worker-home.example.invalid:8787",
        hasSharedSecret: true,
        workspaceRootLabel: "<local-path>",
      }],
      workerHealth: [{
        workerId: "otthon",
        ok: true,
        statusCode: 200,
        summary: "worker health ready",
      }],
      workerRepoStatus: [{
        workerId: "otthon",
        ok: true,
        statusCode: 200,
        project: "Attys_DC_BOT",
        branch: "main",
        clean: true,
        summary: "clean",
      }],
      workerNamedChecks: [],
      workerStore: {
        storeStatus: "missing",
        workers: [],
      },
      handoffStore: {
        rootStatus: "missing",
        boxes: [
          { box: "inbox", status: "missing", validMessages: 0, invalidMessages: 0, latestMessageAt: null },
          { box: "outbox", status: "missing", validMessages: 0, invalidMessages: 0, latestMessageAt: null },
          { box: "archive", status: "missing", validMessages: 0, invalidMessages: 0, latestMessageAt: null },
        ],
      },
      checkedAt: "2026-08-01T12:00:00.000Z",
    });
    expect(JSON.stringify(snapshot)).not.toContain("codex_works");
  });

  it("runs only an explicitly configured lightweight named check", async () => {
    const root = makeTempDir();
    const config = parseNasControlPlaneConfig({
      ATTYS_NAS_WORKERS_JSON: JSON.stringify([{
        id: "otthon",
        label: "Otthoni Worker",
        baseUrl: "http://worker-home.example.invalid:8787",
      }]),
      ATTYS_NAS_STATUS_CHECK: "plans",
    });

    const snapshot = await buildNasControlPlaneSnapshot(config, {
      workerStorePath: path.join(root, "data", "workers.json"),
      handoffRoot: path.join(root, "data", "handoff"),
    }, {
      probeWorkersHealth: async () => [],
      readWorkersRepoStatus: async () => [],
      runWorkersNamedCheck: async () => [{
        workerId: "otthon",
        ok: true,
        statusCode: 200,
        check: "plans",
        project: "Attys_DC_BOT",
        summary: "1/1 passed",
      }],
    });

    expect(snapshot.workerNamedChecks).toEqual([{
      workerId: "otthon",
      ok: true,
      statusCode: 200,
      check: "plans",
      project: "Attys_DC_BOT",
      summary: "1/1 passed",
    }]);
  });

  it("reads public-safe NAS build info for status snapshots", () => {
    const root = makeTempDir();
    const buildInfoPath = path.join(root, "NAS_BUILD_INFO.json");
    fs.writeFileSync(buildInfoPath, JSON.stringify({
      sourceCommit: "ebfa22a9abcd",
      packageVersion: "0.1.1-prerelease.2",
      generatedAt: "2026-08-01T19:19:43Z",
      includeSource: true,
      localPath: "E:\\private\\repo",
    }));

    expect(readNasControlPlaneBuildInfo(buildInfoPath)).toEqual({
      sourceCommit: "ebfa22a9abcd",
      packageVersion: "0.1.1-prerelease.2",
      generatedAt: "2026-08-01T19:19:43Z",
      includeSource: true,
    });
  });

  it("falls back safely when NAS build info is missing or invalid", () => {
    const root = makeTempDir();
    const invalidPath = path.join(root, "NAS_BUILD_INFO.json");
    fs.writeFileSync(invalidPath, "{ nope");

    expect(readNasControlPlaneBuildInfo(path.join(root, "missing.json"))).toEqual({
      sourceCommit: "unknown",
      packageVersion: "unknown",
      generatedAt: "unknown",
      includeSource: false,
    });
    expect(readNasControlPlaneBuildInfo(invalidPath)).toEqual({
      sourceCommit: "unknown",
      packageVersion: "unknown",
      generatedAt: "unknown",
      includeSource: false,
    });
  });
});
