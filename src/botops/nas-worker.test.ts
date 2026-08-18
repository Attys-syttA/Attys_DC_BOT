import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("better-sqlite3", async () => {
  const actual = await vi.importActual("better-sqlite3") as any;
  const RealDatabase = actual.default;
  return {
    default: function MemoryDatabase(_path: string, options?: object) {
      return new RealDatabase(":memory:", options);
    },
  };
});

import {
  createOrGetBotOpsJob,
  getBotOpsJob,
  initDatabase,
  listBotOpsWorkerHeartbeats,
} from "../db/database.js";
import {
  buildNasWorkerStatusSnapshot,
  formatNasWorkerStatus,
  recordNasWorkerStatus,
  runNasWorkerOnce,
} from "./nas-worker.js";

describe("NAS worker", () => {
  beforeEach(() => {
    initDatabase();
  });

  it("reports idle when there is no NAS job", () => {
    const result = runNasWorkerOnce("worker-1", new Date("2026-08-18T10:00:00.000Z"));

    expect(result.status).toBe("idle");
    expect(result.result).toBe("no requested NAS worker job");
    expect(listBotOpsWorkerHeartbeats("nas")[0]).toMatchObject({
      worker_id: "worker-1",
      status: "idle",
      detail: "no requested NAS worker job",
    });
  });

  it("completes one fixed NAS worker check job", () => {
    createOrGetBotOpsJob({
      job_id: "nas-check-1",
      requested_by: "operator",
      target: "nas",
      capability: "nas.worker.check",
      summary: "worker check",
    });

    const result = runNasWorkerOnce("worker-1", new Date("2026-08-18T10:00:00.000Z"));

    expect(result.status).toBe("completed");
    expect(result.job?.job_id).toBe("nas-check-1");
    expect(result.result).toContain("NAS worker check completed");
    expect(getBotOpsJob("nas-check-1")?.status).toBe("Completed");
    expect(getBotOpsJob("nas-check-1")?.lease_owner).toBeNull();
  });

  it("does not pick Windows jobs", () => {
    createOrGetBotOpsJob({
      job_id: "windows-status-1",
      requested_by: "operator",
      target: "windows",
      capability: "status.read",
      summary: "windows status",
    });

    expect(runNasWorkerOnce("worker-1").status).toBe("idle");
    expect(getBotOpsJob("windows-status-1")?.status).toBe("Requested");
  });

  it("formats public-safe worker status", () => {
    createOrGetBotOpsJob({
      job_id: "nas-check-2",
      requested_by: "operator",
      target: "nas",
      capability: "nas.worker.check",
      summary: "worker check",
    });

    const formatted = formatNasWorkerStatus(buildNasWorkerStatusSnapshot("worker-1"));

    expect(formatted).toContain("worker: worker-1");
    expect(formatted).toContain("capabilities: nas.worker.check");
    expect(formatted).toContain("queued jobs: 1");
    expect(formatted).not.toContain(":\\");
  });

  it("records public-safe status heartbeats", () => {
    const snapshot = buildNasWorkerStatusSnapshot("worker-1");
    recordNasWorkerStatus(snapshot, "status", "manual status check", new Date("2026-08-18T10:00:00.000Z"));

    expect(snapshot.capabilities).toEqual(["nas.worker.check"]);
    expect(listBotOpsWorkerHeartbeats("nas")[0]).toMatchObject({
      worker_id: "worker-1",
      status: "status",
      detail: "manual status check",
      heartbeat_at: "2026-08-18T10:00:00.000Z",
    });
  });
});
