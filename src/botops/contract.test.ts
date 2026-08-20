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
    expect(capabilityRequiresApproval("source.write.revert")).toBe(true);
    expect(capabilityRequiresApproval("repair.cleanup")).toBe(true);
    expect(capabilityRequiresApproval("git.push")).toBe(true);
    expect(capabilityRequiresApproval("service.restart")).toBe(true);
    expect(capabilityRequiresApproval("nas.deploy.apply")).toBe(true);
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
    expect(job.expected_action).toBe("run a fixed NAS worker health check");
    expect(job.validation_condition).toBe("NAS worker records a public-safe status result");
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
    expect(job.expected_action).toBe("restart the fixed Windows bot service helper");
    expect(job.validation_condition).toBe("bot health and command registration remain valid after restart");
  });

  it("keeps explicit approval preview metadata when a job needs a narrower contract", () => {
    const job = createBotOpsJob({
      job_id: "push-1",
      requested_by: "operator",
      target: "windows",
      capability: "git.push",
      summary: "push after release",
      expected_action: "push commit abc123 to origin/main",
      validation_condition: "origin/main contains abc123 and worktree stays clean",
    });

    expect(job.expected_action).toBe("push commit abc123 to origin/main");
    expect(job.validation_condition).toBe("origin/main contains abc123 and worktree stays clean");
  });

  it("creates git push jobs with fetch-aware approval metadata", () => {
    const job = createBotOpsJob({
      job_id: "push-default",
      requested_by: "operator",
      target: "windows",
      capability: "git.push",
      summary: "push current branch",
    });

    expect(job.status).toBe("WaitingApproval");
    expect(job.expected_action).toBe("fetch remote refs and push the current clean branch to its upstream");
    expect(job.validation_condition).toBe("fetch succeeds, branch is not behind upstream, and push succeeds without force or rebase");
  });

  it("creates NAS deploy apply jobs with exact approval metadata", () => {
    const job = createBotOpsJob({
      job_id: "nas-deploy-apply-1",
      requested_by: "operator",
      target: "nas",
      capability: "nas.deploy.apply",
      summary: "deploy apply",
    });

    expect(job.status).toBe("WaitingApproval");
    expect(job.approval_state).toBe("required");
    expect(job.expected_action).toBe("run the fixed NAS deploy apply helper and post-deploy verifier");
    expect(job.validation_condition).toBe("deploy apply exits successfully and NAS deploy verifier passes afterwards");
  });

  it("creates source handoff jobs with exact approval metadata", () => {
    const revert = createBotOpsJob({
      job_id: "source-revert-1",
      requested_by: "operator",
      target: "windows",
      capability: "source.write.revert",
      summary: "revert applied repair",
    });
    const cleanup = createBotOpsJob({
      job_id: "repair-cleanup-1",
      requested_by: "operator",
      target: "windows",
      capability: "repair.cleanup",
      summary: "cleanup repair workspace",
    });

    expect(revert.status).toBe("WaitingApproval");
    expect(revert.expected_action).toBe("revert an applied repair diff from the source worktree");
    expect(revert.validation_condition).toBe("the original named check passes again after revert");
    expect(cleanup.status).toBe("WaitingApproval");
    expect(cleanup.expected_action).toBe("remove a guarded isolated repair worktree");
    expect(cleanup.validation_condition).toBe("cleanup succeeds without modifying the source worktree");
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
      expected_action: "apply a reviewed passing repair diff to the source worktree",
      validation: "the original named check passes again in the source worktree",
      created_at: "2026-08-18T10:00:00.000Z",
      expires_at: "2026-08-18T10:05:00.000Z",
    };

    expect(approvalMatchesJob(job, approval, new Date("2026-08-18T10:01:00.000Z"))).toBe(true);
    expect(approvalMatchesJob(job, { ...approval, capability: "git.push" }, new Date("2026-08-18T10:01:00.000Z"))).toBe(false);
    expect(approvalMatchesJob(job, { ...approval, expected_action: "push branch" }, new Date("2026-08-18T10:01:00.000Z"))).toBe(false);
    expect(approvalMatchesJob(job, { ...approval, validation: "skip validation" }, new Date("2026-08-18T10:01:00.000Z"))).toBe(false);
    expect(approvalMatchesJob(job, approval, new Date("2026-08-18T10:06:00.000Z"))).toBe(false);
  });

  it("detects expired leases without treating missing leases as expired", () => {
    expect(isLeaseExpired({ lease_expires_at: null }, new Date("2026-08-18T10:00:00.000Z"))).toBe(false);
    expect(isLeaseExpired({ lease_expires_at: "2026-08-18T09:59:59.000Z" }, new Date("2026-08-18T10:00:00.000Z"))).toBe(true);
  });
});
