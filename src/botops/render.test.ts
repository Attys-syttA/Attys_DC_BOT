import { describe, expect, it } from "vitest";
import { formatBotOpsJobDetails, formatBotOpsJobLine } from "./render.js";
import type { BotOpsJob } from "./contract.js";

function makeJob(overrides: Partial<BotOpsJob> = {}): BotOpsJob {
  return {
    job_id: "job-1",
    requested_by: "operator",
    target: "nas",
    capability: "nas.worker.check",
    summary: "worker check",
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
  });

  it("shows WaitingWorker result on compact job lines", () => {
    const content = formatBotOpsJobLine(makeJob({
      status: "WaitingWorker",
      result: "worker lease expired",
    }));

    expect(content).toContain("WaitingWorker nas/nas.worker.check result=worker lease expired");
  });
});
