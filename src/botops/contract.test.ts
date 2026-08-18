import { describe, expect, it } from "vitest";
import {
  approvalMatchesJob,
  capabilityRequiresApproval,
  createBotOpsJob,
  isBotOpsCapability,
  isLeaseExpired,
  type BotOpsApproval,
} from "./contract.js";

describe("BotOps contract", () => {
  it("accepts only allowlisted capabilities", () => {
    expect(isBotOpsCapability("status.read")).toBe(true);
    expect(isBotOpsCapability("shell.exec")).toBe(false);
  });

  it("requires approval for consequential capabilities", () => {
    expect(capabilityRequiresApproval("status.read")).toBe(false);
    expect(capabilityRequiresApproval("audit.check")).toBe(false);
    expect(capabilityRequiresApproval("audit.repair.apply")).toBe(true);
    expect(capabilityRequiresApproval("git.push")).toBe(true);
    expect(capabilityRequiresApproval("service.restart")).toBe(true);
  });

  it("creates read-only jobs without approval", () => {
    const job = createBotOpsJob({
      job_id: "status-1",
      requested_by: "operator",
      target: "nas",
      capability: "nas.worker.check",
      summary: "check worker",
    }, new Date("2026-08-18T10:00:00.000Z"));

    expect(job.status).toBe("Requested");
    expect(job.approval_state).toBe("not_required");
    expect(job.payload_json).toBe("");
    expect(job.created_at).toBe("2026-08-18T10:00:00.000Z");
  });

  it("parks write/restart jobs at the approval gate", () => {
    const job = createBotOpsJob({
      job_id: "restart-1",
      requested_by: "operator",
      target: "windows",
      capability: "service.restart",
      summary: "restart bot",
    });

    expect(job.status).toBe("WaitingApproval");
    expect(job.approval_state).toBe("required");
  });

  it("matches approvals by exact job target and capability", () => {
    const job = createBotOpsJob({
      job_id: "apply-1",
      requested_by: "operator",
      target: "repo",
      capability: "audit.repair.apply",
      summary: "apply repair",
    }, new Date("2026-08-18T10:00:00.000Z"));
    const approval: BotOpsApproval = {
      approval_id: "approval-1",
      job_id: "apply-1",
      approved_by: "operator",
      target: "repo",
      capability: "audit.repair.apply",
      state: "approved",
      expected_action: "apply reviewed repair",
      validation: "rerun tests",
      created_at: "2026-08-18T10:00:00.000Z",
      expires_at: "2026-08-18T10:05:00.000Z",
    };

    expect(approvalMatchesJob(job, approval, new Date("2026-08-18T10:01:00.000Z"))).toBe(true);
    expect(approvalMatchesJob(job, { ...approval, capability: "git.push" }, new Date("2026-08-18T10:01:00.000Z"))).toBe(false);
    expect(approvalMatchesJob(job, approval, new Date("2026-08-18T10:06:00.000Z"))).toBe(false);
  });

  it("detects expired leases without treating missing leases as expired", () => {
    expect(isLeaseExpired({ lease_expires_at: null }, new Date("2026-08-18T10:00:00.000Z"))).toBe(false);
    expect(isLeaseExpired({ lease_expires_at: "2026-08-18T09:59:59.000Z" }, new Date("2026-08-18T10:00:00.000Z"))).toBe(true);
  });
});
