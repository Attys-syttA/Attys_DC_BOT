import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkerRegistration } from "./worker-registry.js";
import {
  createWorkerStoreSnapshot,
  readPublicWorkerStore,
  upsertWorkerHeartbeat,
} from "./worker-store.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attys-nas-store-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("NAS worker store", () => {
  it("reports a missing store without leaking the local path", () => {
    const result = readPublicWorkerStore(
      path.join(makeTempDir(), "workers.json"),
      new Date("2026-08-01T12:00:00.000Z"),
      120_000,
    );

    expect(result).toEqual({
      storeStatus: "missing",
      workers: [],
    });
  });

  it("reads public worker statuses from a local JSON store", () => {
    const dir = makeTempDir();
    const storePath = path.join(dir, "workers.json");
    const state = createWorkerRegistration({
      workerId: "home worker",
      label: "Home Worker",
      hostKind: "windows-worker",
      workspaceRootLabel: "codex_works-home",
      capabilities: ["health", "heartbeat"],
    }, new Date("2026-08-01T12:00:00.000Z"));

    fs.writeFileSync(storePath, JSON.stringify(createWorkerStoreSnapshot([state])), "utf8");

    expect(readPublicWorkerStore(
      storePath,
      new Date("2026-08-01T12:00:30.000Z"),
      120_000,
    )).toEqual({
      storeStatus: "ready",
      workers: [{
        workerId: "home-worker",
        label: "Home Worker",
        hostKind: "windows-worker",
        workspaceRootLabel: "codex_works-home",
        capabilities: ["health", "heartbeat"],
        lastSeenAt: "2026-08-01T12:00:00.000Z",
        status: "online",
      }],
    });
  });

  it("fails closed for invalid store content", () => {
    const dir = makeTempDir();
    const storePath = path.join(dir, "workers.json");
    fs.writeFileSync(storePath, "{not json", "utf8");

    expect(readPublicWorkerStore(storePath).storeStatus).toBe("invalid");
  });

  it("does not expose raw paths or ids from stored worker data", () => {
    const dir = makeTempDir();
    const storePath = path.join(dir, "workers.json");
    fs.writeFileSync(storePath, JSON.stringify({
      schemaVersion: 1,
      generatedAt: "2026-08-01T12:00:00.000Z",
      workers: [{
        workerId: "123456789012345678",
        label: "C:\\Users\\someone\\repo",
        hostKind: "windows-worker",
        workspaceRootLabel: "E:\\codex_works",
        capabilities: ["DISCORD_BOT_TOKEN=abc123"],
        registeredAt: "2026-08-01T12:00:00.000Z",
        lastSeenAt: "2026-08-01T12:00:00.000Z",
        status: "online",
      }],
    }), "utf8");

    const serialized = JSON.stringify(readPublicWorkerStore(
      storePath,
      new Date("2026-08-01T12:00:30.000Z"),
      120_000,
    ));

    expect(serialized).toContain("<local-path>");
    expect(serialized).not.toContain("someone");
    expect(serialized).not.toContain("123456789012345678");
    expect(serialized).not.toContain("abc123");
    expect(serialized).not.toContain("DISCORD_BOT_TOKEN");
    expect(serialized).not.toContain("discord_bot_token");
  });

  it("upserts a worker heartbeat into the local store", () => {
    const dir = makeTempDir();
    const storePath = path.join(dir, "data", "workers.json");

    const first = upsertWorkerHeartbeat(storePath, {
      workerId: "home-worker",
      label: "Home Worker",
      hostKind: "windows-worker",
      workspaceRootLabel: "codex_works-home",
      capabilities: ["health"],
    }, new Date("2026-08-01T12:00:00.000Z"));

    const second = upsertWorkerHeartbeat(storePath, {
      workerId: "home-worker",
      label: "Home Worker Updated",
      hostKind: "windows-worker",
      workspaceRootLabel: "codex_works-home",
      capabilities: ["health", "heartbeat"],
    }, new Date("2026-08-01T12:01:00.000Z"));

    expect(first.registeredAt).toBe("2026-08-01T12:00:00.000Z");
    expect(second.registeredAt).toBe("2026-08-01T12:00:00.000Z");
    expect(second.lastSeenAt).toBe("2026-08-01T12:01:00.000Z");

    const publicStore = readPublicWorkerStore(
      storePath,
      new Date("2026-08-01T12:01:01.000Z"),
      120_000,
    );

    expect(publicStore.workers).toHaveLength(1);
    expect(publicStore.workers[0]).toMatchObject({
      workerId: "home-worker",
      label: "Home Worker Updated",
      capabilities: ["health", "heartbeat"],
      status: "online",
    });
  });

  it("refuses to overwrite an invalid store during heartbeat upsert", () => {
    const dir = makeTempDir();
    const storePath = path.join(dir, "workers.json");
    fs.writeFileSync(storePath, "{not json", "utf8");

    expect(() => upsertWorkerHeartbeat(storePath, {
      workerId: "home-worker",
      label: "Home Worker",
      hostKind: "windows-worker",
      workspaceRootLabel: "codex_works-home",
      capabilities: ["health"],
    })).toThrow();
  });
});
