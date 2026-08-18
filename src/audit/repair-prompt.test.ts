import { describe, expect, it } from "vitest";
import { buildAuditRepairContract, type AuditRepairContract } from "./repair-contract.js";
import { buildAuditRepairPrompt, validateAuditRepairPrompt } from "./repair-prompt.js";
import type { AuditJobRecord, AuditRepairWorktreeRecord, AuditStepRecord } from "../db/types.js";

function makeJob(overrides: Partial<AuditJobRecord> = {}): AuditJobRecord {
  return {
    id: "audit-job-1",
    channel_id: "channel-1",
    project_label: "<local-path>/app",
    mode: "check-only",
    status: "waiting_manual_review",
    requested_check: "tests",
    current_step: null,
    iteration: 1,
    max_iterations: 2,
    stop_requested: 0,
    capabilities_json: "[]",
    created_at: "2026-08-02T10:00:00.000Z",
    updated_at: "2026-08-02T10:01:00.000Z",
    ...overrides,
  };
}

function makeStep(overrides: Partial<AuditStepRecord> = {}): AuditStepRecord {
  return {
    id: "step-1",
    job_id: "audit-job-1",
    step_name: "tests",
    status: "failed",
    exit_code: 1,
    timed_out: 0,
    stopped: 0,
    public_output: "FAIL tests: public-safe assertion summary",
    started_at: "2026-08-02T10:00:00.000Z",
    finished_at: "2026-08-02T10:01:00.000Z",
    duration_ms: 60_000,
    created_at: "2026-08-02T10:01:00.000Z",
    ...overrides,
  };
}

function makeRepairWorktree(overrides: Partial<AuditRepairWorktreeRecord> = {}): AuditRepairWorktreeRecord {
  return {
    job_id: "audit-job-1",
    worktree_path: "C:\\Users\\secret\\project\\.discord-bot-state\\audit-worktrees\\audit-job-1",
    branch_name: "audit-repair/audit-job-1",
    head_commit: "0123456789abcdef",
    status: "retained",
    created_at: "2026-08-02T10:02:00.000Z",
    updated_at: "2026-08-02T10:03:00.000Z",
    ...overrides,
  };
}

describe("audit repair prompt", () => {
  it("builds a bounded prompt from a valid repair contract", () => {
    const contract = buildAuditRepairContract({
      job: makeJob(),
      steps: [makeStep()],
      repairWorktree: makeRepairWorktree(),
      repairChangeSummary: "clean",
    });

    const prompt = buildAuditRepairPrompt(contract);

    expect(prompt).toContain("Contract version: audit-repair-contract/v2");
    expect(prompt).toContain("Target check: tests");
    expect(prompt).toContain("Role phases in this single repair turn:");
    expect(prompt).toContain("planner:");
    expect(prompt).toContain("executor:");
    expect(prompt).toContain("validator:");
    expect(prompt).toContain("Do not source worktree write.");
    expect(prompt).toContain("Do not install dependencies, deploy, merge, commit, push, or run arbitrary shell commands.");
    expect(prompt).toContain("Leave validation to the orchestrator; it will run /audit recheck.");
    expect(validateAuditRepairPrompt(prompt, contract)).toEqual([]);
  });

  it("rejects contract drift before prompt generation", () => {
    const contract = buildAuditRepairContract({
      job: makeJob(),
      steps: [makeStep()],
      repairWorktree: makeRepairWorktree(),
      repairChangeSummary: "clean",
    });
    const broken: AuditRepairContract = {
      ...contract,
      allowedScope: "source worktree",
    };

    expect(() => buildAuditRepairPrompt(broken)).toThrow("invalid audit repair contract");
  });

  it("detects prompt drift against the contract", () => {
    const contract = buildAuditRepairContract({
      job: makeJob(),
      steps: [makeStep()],
      repairWorktree: makeRepairWorktree(),
      repairChangeSummary: "clean",
    });
    const prompt = buildAuditRepairPrompt(contract)
      .replace("Do not push.", "Push if convenient.");

    expect(validateAuditRepairPrompt(prompt, contract)).toContain("repair prompt does not block push");
  });
});
