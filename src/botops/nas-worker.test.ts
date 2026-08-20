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
  approveBotOpsJob,
  createOrGetBotOpsJob,
  getBotOpsJob,
  initDatabase,
  listBotOpsWorkerHeartbeats,
} from "../db/database.js";
import {
  buildNasWorkerStatusSnapshot,
  type FixedNasCommandRunner,
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

  it("does not pick NAS deploy verify jobs without approval", () => {
    createOrGetBotOpsJob({
      job_id: "nas-verify-1",
      requested_by: "operator",
      target: "nas",
      capability: "nas.deploy.verify",
      summary: "deploy verify",
    });

    expect(runNasWorkerOnce("worker-1").status).toBe("idle");
    expect(getBotOpsJob("nas-verify-1")?.status).toBe("WaitingApproval");
  });

  it("does not pick NAS deploy apply jobs without approval", () => {
    createOrGetBotOpsJob({
      job_id: "nas-apply-1",
      requested_by: "operator",
      target: "nas",
      capability: "nas.deploy.apply",
      summary: "deploy apply",
    });

    expect(runNasWorkerOnce("worker-1").status).toBe("idle");
    expect(getBotOpsJob("nas-apply-1")?.status).toBe("WaitingApproval");
  });

  it("runs only the fixed NAS deploy verifier after approval", () => {
    const calls: string[] = [];
    const runner: FixedNasCommandRunner = (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      if ((command === "npm" || command === "npm.cmd") && args.join(" ") === "run nas:deploy:verify") {
        return { code: 0, output: "passed" };
      }
      return { code: 1, output: "unexpected" };
    };
    createOrGetBotOpsJob({
      job_id: "nas-verify-approved",
      requested_by: "operator",
      target: "nas",
      capability: "nas.deploy.verify",
      summary: "deploy verify",
    });
    approveBotOpsJob("nas-verify-approved", "operator", new Date("2026-08-18T10:00:00.000Z"));

    const result = runNasWorkerOnce("worker-1", new Date("2026-08-18T10:01:00.000Z"), runner);

    expect(result.status).toBe("completed");
    expect(result.result).toBe("NAS deploy verify helper completed: verifier passed");
    expect(calls.some((call) => call.endsWith("run nas:deploy:verify"))).toBe(true);
    expect(getBotOpsJob("nas-verify-approved")?.status).toBe("Completed");
  });

  it("records failed NAS deploy verifier results without fallback deploy", () => {
    const runner: FixedNasCommandRunner = () => ({ code: 1, output: "failed" });
    createOrGetBotOpsJob({
      job_id: "nas-verify-failed",
      requested_by: "operator",
      target: "nas",
      capability: "nas.deploy.verify",
      summary: "deploy verify",
    });
    approveBotOpsJob("nas-verify-failed", "operator", new Date("2026-08-18T10:00:00.000Z"));

    const result = runNasWorkerOnce("worker-1", new Date("2026-08-18T10:01:00.000Z"), runner);

    expect(result.status).toBe("failed");
    expect(result.result).toBe("NAS deploy verify helper failed: verifier failed");
    expect(getBotOpsJob("nas-verify-failed")?.status).toBe("Failed");
  });

  it("runs the fixed NAS deploy apply helper and then the verifier after approval", () => {
    const calls: string[] = [];
    const runner: FixedNasCommandRunner = (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      if ((command === "npm" || command === "npm.cmd") && args.join(" ") === "run nas:deploy -- -Apply") {
        return { code: 0, output: "applied" };
      }
      if ((command === "npm" || command === "npm.cmd") && args.join(" ") === "run nas:deploy:verify") {
        return { code: 0, output: "verified" };
      }
      return { code: 1, output: "unexpected" };
    };
    createOrGetBotOpsJob({
      job_id: "nas-apply-approved",
      requested_by: "operator",
      target: "nas",
      capability: "nas.deploy.apply",
      summary: "deploy apply",
    });
    approveBotOpsJob("nas-apply-approved", "operator", new Date("2026-08-18T10:00:00.000Z"));

    const result = runNasWorkerOnce("worker-1", new Date("2026-08-18T10:01:00.000Z"), runner);

    expect(result.status).toBe("completed");
    expect(result.result).toBe("NAS deploy apply helper completed and post-verify passed");
    expect(calls).toEqual(expect.arrayContaining([
      expect.stringMatching(/run nas:deploy -- -Apply$/),
      expect.stringMatching(/run nas:deploy:verify$/),
    ]));
    expect(getBotOpsJob("nas-apply-approved")?.status).toBe("Completed");
  });

  it("does not run post-verify when NAS deploy apply fails", () => {
    const calls: string[] = [];
    const runner: FixedNasCommandRunner = (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      return { code: 1, output: "apply failed" };
    };
    createOrGetBotOpsJob({
      job_id: "nas-apply-failed",
      requested_by: "operator",
      target: "nas",
      capability: "nas.deploy.apply",
      summary: "deploy apply",
    });
    approveBotOpsJob("nas-apply-failed", "operator", new Date("2026-08-18T10:00:00.000Z"));

    const result = runNasWorkerOnce("worker-1", new Date("2026-08-18T10:01:00.000Z"), runner);

    expect(result.status).toBe("failed");
    expect(result.result).toBe("NAS deploy apply helper failed before post-verify");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/run nas:deploy -- -Apply$/);
    expect(getBotOpsJob("nas-apply-failed")?.status).toBe("Failed");
  });

  it("moves NAS deploy apply to manual review when post-verify fails", () => {
    const runner: FixedNasCommandRunner = (_command, args) => {
      if (args.join(" ") === "run nas:deploy -- -Apply") {
        return { code: 0, output: "applied" };
      }
      return { code: 1, output: "verify failed" };
    };
    createOrGetBotOpsJob({
      job_id: "nas-apply-verify-failed",
      requested_by: "operator",
      target: "nas",
      capability: "nas.deploy.apply",
      summary: "deploy apply",
    });
    approveBotOpsJob("nas-apply-verify-failed", "operator", new Date("2026-08-18T10:00:00.000Z"));

    const result = runNasWorkerOnce("worker-1", new Date("2026-08-18T10:01:00.000Z"), runner);

    expect(result.status).toBe("failed");
    expect(result.result).toBe("NAS deploy apply helper completed but post-verify failed");
    expect(getBotOpsJob("nas-apply-verify-failed")?.status).toBe("WaitingManualReview");
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
    expect(formatted).toContain("capabilities: nas.worker.check, nas.deploy.verify, nas.deploy.apply");
    expect(formatted).toContain("queued jobs: 1");
    expect(formatted).not.toContain(":\\");
  });

  it("records public-safe status heartbeats", () => {
    const snapshot = buildNasWorkerStatusSnapshot("worker-1");
    recordNasWorkerStatus(snapshot, "status", "manual status check", new Date("2026-08-18T10:00:00.000Z"));

    expect(snapshot.capabilities).toEqual(["nas.worker.check", "nas.deploy.verify", "nas.deploy.apply"]);
    expect(listBotOpsWorkerHeartbeats("nas")[0]).toMatchObject({
      worker_id: "worker-1",
      status: "status",
      detail: "manual status check",
      heartbeat_at: "2026-08-18T10:00:00.000Z",
    });
  });
});
