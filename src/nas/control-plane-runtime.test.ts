import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseNasControlPlaneConfig } from "./control-plane-config.js";
import { buildNasControlPlaneSnapshot } from "./control-plane-runtime.js";

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
    }, {
      now: () => new Date("2026-08-01T12:00:00.000Z"),
      probeWorkersHealth: async () => [{
        workerId: "otthon",
        ok: true,
        statusCode: 200,
        summary: "worker health ready",
      }],
    });

    expect(snapshot).toEqual({
      controlPlaneName: "home-nas",
      publicBaseUrl: "",
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
});
