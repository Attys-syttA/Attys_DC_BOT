import { describe, expect, it } from "vitest";
import {
  buildBotOpsStatusReply,
  formatBotOpsNextDecision,
  formatBotOpsJobDetails,
  formatBotOpsJobLine,
  formatBotOpsWorkerHeartbeats,
} from "./render.js";
import type { BotOpsJob } from "./contract.js";
import type { BotOpsWorkerHeartbeatRecord } from "../db/types.js";

function makeJob(overrides: Partial<BotOpsJob> = {}): BotOpsJob {
  return {
    job_id: "job-1",
    requested_by: "operator",
    target: "nas",
    capability: "nas.worker.check",
    summary: "worker check",
    payload_json: "",
    expected_action: "run a fixed NAS worker health check",
    validation_condition: "NAS worker records a public-safe status result",
    created_at: "2026-08-18T10:00:00.000Z",
    status: "Requested",
    approval_state: "not_required",
    approved_by: null,
    approval_expires_at: null,
    lease_owner: null,
    lease_expires_at: null,
    heartbeat_at: null,
    logs: "",
    result: "",
    updated_at: "2026-08-18T10:00:00.000Z",
    ...overrides,
  };
}

describe("BotOps renderer", () => {
  it("shows lease expiry in job details", () => {
    const content = formatBotOpsJobDetails(makeJob({
      status: "Running",
      lease_owner: "worker-1",
      lease_expires_at: "2026-08-18T10:00:30.000Z",
    }));

    expect(content).toContain("lease: worker-1");
    expect(content).toContain("lease expires: 2026-08-18T10:00:30.000Z");
    expect(content).toContain("expected action: run a fixed NAS worker health check");
    expect(content).toContain("validation: NAS worker records a public-safe status result");
  });

  it("shows WaitingWorker result on compact job lines", () => {
    const content = formatBotOpsJobLine(makeJob({
      status: "WaitingWorker",
      result: "worker lease expired",
    }));

    expect(content).toContain("WaitingWorker nas/nas.worker.check result=worker lease expired");
  });

  it("shows manual-review results on compact job lines", () => {
    const content = formatBotOpsJobLine(makeJob({
      status: "WaitingManualReview",
      capability: "nas.deploy.apply",
      result: "post-verify failed",
    }));

    expect(content).toContain("WaitingManualReview nas/nas.deploy.apply result=post-verify failed");
  });

  it("labels waiting approval jobs as dangerous on compact job lines", () => {
    const content = formatBotOpsJobLine(makeJob({
      status: "WaitingApproval",
      approval_state: "required",
      capability: "nas.deploy.apply",
    }));

    expect(content).toContain("WaitingApproval nas/nas.deploy.apply approval=required dangerous=yes");
  });

  it("labels worker heartbeats as fresh or stale", () => {
    const heartbeats: BotOpsWorkerHeartbeatRecord[] = [
      {
        worker_id: "windows-worker-1",
        target: "windows",
        host: "host-a",
        capabilities: "status.read",
        status: "idle",
        detail: "no job",
        heartbeat_at: "2026-08-18T10:00:00.000Z",
      },
      {
        worker_id: "nas-worker-1",
        target: "nas",
        host: "host-a",
        capabilities: "nas.worker.check",
        status: "idle",
        detail: "no job",
        heartbeat_at: "2026-08-18T09:55:00.000Z",
      },
    ];

    const content = formatBotOpsWorkerHeartbeats(
      heartbeats,
      new Date("2026-08-18T10:00:30.000Z"),
      120_000,
    );

    expect(content).toContain("windows-worker-1: idle fresh");
    expect(content).toContain("nas-worker-1: idle stale");
  });

  it("includes worker heartbeat visibility in the aggregate status", () => {
    const content = buildBotOpsStatusReply(
      [makeJob({ status: "WaitingWorker", result: "worker lease expired" })],
      [{
        worker_id: "windows-worker-1",
        target: "windows",
        host: "host-a",
        capabilities: "status.read, audit.check",
        status: "idle",
        detail: "no job",
        heartbeat_at: "2026-08-18T10:00:00.000Z",
      }],
    );

    expect(content).toContain("waiting worker: 1");
    expect(content).toContain("worker heartbeats:");
    expect(content).toContain("windows-worker-1: idle");
  });

  it("shows the next operator decision for waiting approval jobs", () => {
    const content = buildBotOpsStatusReply([
      makeJob({
        job_id: "nas-deploy-apply-1",
        capability: "nas.deploy.apply",
        status: "WaitingApproval",
        approval_state: "required",
      }),
    ]);

    expect(content).toContain("next decision: review /ops preview job_id:nas-deploy-apply-1, then /ops approve or /ops cancel");
  });

  it("prioritizes worker recovery hints after approval gates", () => {
    expect(formatBotOpsNextDecision([
      makeJob({ job_id: "expired-lease-1", status: "WaitingWorker", result: "worker lease expired" }),
    ])).toBe("next decision: check worker, then /ops recover job_id:expired-lease-1 if the lease expired");
  });

  it("shows manual review as the next operator decision", () => {
    const content = buildBotOpsStatusReply([
      makeJob({
        job_id: "nas-deploy-apply-verify-failed",
        capability: "nas.deploy.apply",
        status: "WaitingManualReview",
        result: "post-verify failed",
      }),
    ]);

    expect(content).toContain("waiting manual review: 1");
    expect(content).toContain("next decision: manual review required; inspect /ops logs job_id:nas-deploy-apply-verify-failed");
  });

  it("shows no pending decision when jobs are completed", () => {
    expect(formatBotOpsNextDecision([
      makeJob({ status: "Completed", result: "done" }),
    ])).toBe("next decision: none");
  });
});
