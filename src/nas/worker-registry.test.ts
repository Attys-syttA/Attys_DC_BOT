import { describe, expect, it } from "vitest";
import {
  WORKER_MESSAGE_TYPES,
  buildPublicWorkerStatus,
  createWorkerRegistration,
  isWorkerMessageType,
  markWorkerHeartbeat,
} from "./worker-registry.js";

describe("NAS worker registry contract", () => {
  it("defines the first public-safe worker message types", () => {
    expect(WORKER_MESSAGE_TYPES).toEqual([
      "worker.register",
      "worker.heartbeat",
      "worker.health",
      "worker.status",
    ]);
    expect(isWorkerMessageType("worker.register")).toBe(true);
    expect(isWorkerMessageType("worker.prompt")).toBe(false);
    expect(isWorkerMessageType("worker.repair")).toBe(false);
  });

  it("creates a public-safe Windows worker registration", () => {
    const state = createWorkerRegistration({
      workerId: "home worker",
      label: "Home Windows Worker",
      hostKind: "windows-worker",
      workspaceRootLabel: "codex_works-home",
      capabilities: ["health", "heartbeat", "health"],
    }, new Date("2026-08-01T12:00:00.000Z"));

    expect(state).toEqual({
      workerId: "home-worker",
      label: "Home Windows Worker",
      hostKind: "windows-worker",
      workspaceRootLabel: "codex_works-home",
      capabilities: ["health", "heartbeat"],
      registeredAt: "2026-08-01T12:00:00.000Z",
      lastSeenAt: "2026-08-01T12:00:00.000Z",
      status: "online",
    });
  });

  it("scrubs raw paths, tokens, ids, and private network details from public status", () => {
    const state = createWorkerRegistration({
      workerId: "123456789012345678",
      label: "DISCORD_BOT_TOKEN=abc123 C:\\Users\\someone\\repo 127.0.0.1",
      hostKind: "windows-worker",
      workspaceRootLabel: "E:\\codex_works",
      capabilities: [
        "health",
        "secret-token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
        "run tests",
      ],
    }, new Date("2026-08-01T12:00:00.000Z"));

    const publicStatus = buildPublicWorkerStatus(
      state,
      new Date("2026-08-01T12:00:30.000Z"),
      60_000,
    );
    const serialized = JSON.stringify(publicStatus);

    expect(publicStatus.workerId).toBe("worker-id");
    expect(serialized).toContain("<redacted>");
    expect(serialized).toContain("<local-path>");
    expect(serialized).toContain("<ip>");
    expect(serialized).not.toContain("abc123");
    expect(serialized).not.toContain("someone");
    expect(serialized).not.toContain("123456789012345678");
    expect(serialized).not.toContain("127.0.0.1");
  });

  it("updates heartbeat timestamps without adding prompt or repair semantics", () => {
    const state = createWorkerRegistration({
      workerId: "home-worker",
      label: "Home Worker",
      hostKind: "windows-worker",
      workspaceRootLabel: "codex_works-home",
      capabilities: ["health"],
    }, new Date("2026-08-01T12:00:00.000Z"));

    const updated = markWorkerHeartbeat(state, new Date("2026-08-01T12:00:30.000Z"));

    expect(updated.lastSeenAt).toBe("2026-08-01T12:00:30.000Z");
    expect(updated.status).toBe("online");
    expect(Object.keys(updated)).not.toContain("prompt");
    expect(Object.keys(updated)).not.toContain("repair");
  });

  it("marks a stale worker offline in the public status view", () => {
    const state = createWorkerRegistration({
      workerId: "home-worker",
      label: "Home Worker",
      hostKind: "windows-worker",
      workspaceRootLabel: "codex_works-home",
      capabilities: ["health"],
    }, new Date("2026-08-01T12:00:00.000Z"));

    expect(buildPublicWorkerStatus(
      state,
      new Date("2026-08-01T12:02:01.000Z"),
      120_000,
    ).status).toBe("offline");
  });

  it("fails closed when the heartbeat timestamp is invalid", () => {
    const state = {
      ...createWorkerRegistration({
        workerId: "home-worker",
        label: "Home Worker",
        hostKind: "windows-worker",
        workspaceRootLabel: "codex_works-home",
        capabilities: ["health"],
      }, new Date("2026-08-01T12:00:00.000Z")),
      lastSeenAt: "not-a-date",
    };

    expect(buildPublicWorkerStatus(
      state,
      new Date("2026-08-01T12:00:01.000Z"),
      120_000,
    ).status).toBe("offline");
  });
});
