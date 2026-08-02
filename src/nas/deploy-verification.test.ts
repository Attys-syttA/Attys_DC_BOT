import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyNasDeploy } from "./deploy-verification.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attys-nas-deploy-verify-test-"));
  tempDirs.push(dir);
  return dir;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeValidShare(root: string): void {
  writeJson(path.join(root, "NAS_STAGING_MANIFEST.json"), {
    sourceCommit: "b92133b0d087",
    packageVersion: "0.1.1-prerelease.2",
    includeSource: true,
  });
  writeJson(path.join(root, "app", "NAS_BUILD_INFO.json"), {
    sourceCommit: "b92133b0d087",
    packageVersion: "0.1.1-prerelease.2",
    generatedAt: "2026-08-01T19:48:21Z",
    includeSource: true,
  });
  writeJson(path.join(root, "logs", "nas-control-plane-status.json"), {
    buildInfo: {
      sourceCommit: "b92133b0d087",
      packageVersion: "0.1.1-prerelease.2",
      includeSource: true,
    },
    codexExecutionEnabled: false,
    configuredWorkers: [
      { id: "otthon", label: "Otthoni worker", hasSharedSecret: true, workspaceRootLabel: "codex_works-home" },
    ],
    workerHealth: [
      { workerId: "otthon", ok: true, statusCode: 200, summary: "worker health ready", baseUrl: "http://private.example.invalid" },
    ],
    handoffStore: {
      rootStatus: "ready",
    },
    checkedAt: "2026-08-01T20:00:00.000Z",
  });
}

describe("NAS deploy verification", () => {
  it("verifies a matching public-safe deployed NAS share", () => {
    const root = makeTempDir();
    writeValidShare(root);

    const result = verifyNasDeploy(root, {
      now: () => new Date("2026-08-01T20:01:00.000Z"),
      maxSnapshotAgeMs: 5 * 60_000,
    });

    expect(result.ok).toBe(true);
    expect(result.sourceCommit).toBe("b92133b0d087");
    expect(result.packageVersion).toBe("0.1.1-prerelease.2");
    expect(result.checks).toContainEqual({
      name: "snapshot-freshness",
      ok: true,
      summary: "fresh",
    });
    expect(result.checks).toContainEqual({
      name: "public-worker-metadata",
      ok: true,
      summary: "worker metadata public-safe",
    });
    expect(JSON.stringify(result)).not.toContain("private.example.invalid");
    expect(JSON.stringify(result)).not.toContain(root);
  });

  it("fails closed when public worker metadata exposes URL fields", () => {
    const root = makeTempDir();
    writeValidShare(root);
    const snapshotPath = path.join(root, "logs", "nas-control-plane-status.json");
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8")) as Record<string, unknown>;
    snapshot.configuredWorkers = [
      { id: "otthon", baseUrl: "http://private.example.invalid:8787" },
    ];
    writeJson(snapshotPath, snapshot);

    const result = verifyNasDeploy(root, {
      now: () => new Date("2026-08-01T20:01:00.000Z"),
      maxSnapshotAgeMs: 5 * 60_000,
    });

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual({
      name: "public-worker-metadata",
      ok: false,
      summary: "worker metadata exposes URL fields",
    });
    expect(JSON.stringify(result)).not.toContain("private.example.invalid");
  });

  it("fails closed when the container snapshot commit differs from the staged source", () => {
    const root = makeTempDir();
    writeValidShare(root);
    writeJson(path.join(root, "logs", "nas-control-plane-status.json"), {
      buildInfo: {
        sourceCommit: "oldcommit",
        packageVersion: "0.1.1-prerelease.2",
        includeSource: true,
      },
      codexExecutionEnabled: false,
      workerHealth: [],
      handoffStore: {
        rootStatus: "ready",
      },
      checkedAt: "2026-08-01T20:00:00.000Z",
    });

    const result = verifyNasDeploy(root, {
      now: () => new Date("2026-08-01T20:01:00.000Z"),
      maxSnapshotAgeMs: 5 * 60_000,
    });

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual({
      name: "snapshot-build-match",
      ok: false,
      summary: "snapshot does not match staged build",
    });
  });

  it("reports missing files without leaking paths", () => {
    const root = makeTempDir();

    const result = verifyNasDeploy(root);

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual({
      name: "manifest",
      ok: false,
      summary: "missing or unreadable",
    });
    expect(JSON.stringify(result)).not.toContain(root);
  });
});
