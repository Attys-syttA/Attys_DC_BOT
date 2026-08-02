import { describe, expect, it } from "vitest";
import { renderAuditRepairPlan } from "./repair-plan.js";
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
    worktree_path: "C:\\secret\\repo\\.discord-bot-state\\audit-worktrees\\audit-job-1",
    branch_name: "audit-repair/audit-job-1",
    head_commit: "0123456789abcdef",
    status: "retained",
    created_at: "2026-08-02T10:02:00.000Z",
    updated_at: "2026-08-02T10:03:00.000Z",
    ...overrides,
  };
}

describe("renderAuditRepairPlan", () => {
  it("renders a public-safe repair contract without exposing the worktree path", () => {
    const content = renderAuditRepairPlan({
      job: makeJob({ project_label: "C:\\Users\\secret\\project" }),
      steps: [makeStep()],
      repairWorktree: makeRepairWorktree(),
      repairChangeSummary: "files=2 staged=0 unstaged=2 untracked=0",
    });

    expect(content).toContain("repair contract: preview only");
    expect(content).toContain("target check: tests");
    expect(content).toContain("repair workspace: retained");
    expect(content).toContain("repair branch: audit-repair/audit-job-1");
    expect(content).toContain("required validation: rerun the original named check through /audit recheck");
    expect(content).toContain("repair prompt: ready");
    expect(content).toContain("blocked actions: source worktree write, automatic merge, commit, push");
    expect(content).not.toContain("C:\\secret");
    expect(content).not.toContain("C:\\Users\\secret");
    expect(content).not.toContain("worktree_path");
  });

  it("reports missing repair workspace as an approval prerequisite", () => {
    const content = renderAuditRepairPlan({
      job: makeJob(),
      steps: [makeStep()],
      repairChangeSummary: "unavailable",
    });

    expect(content).toContain("repair workspace: missing; approve /audit repair first");
    expect(content).toContain("repair prompt: blocked (1 issue(s))");
    expect(content).toContain("repair prompt issues: repair contract has no prepared repair workspace");
    expect(content).toContain("operator decision: review this contract");
  });

  it("blocks prompt readiness when there is no non-passed evidence", () => {
    const content = renderAuditRepairPlan({
      job: makeJob(),
      steps: [makeStep({ status: "passed", exit_code: 0, public_output: "OK tests" })],
      repairWorktree: makeRepairWorktree({ status: "prepared" }),
      repairChangeSummary: "clean",
    });

    expect(content).toContain("latest evidence: tests:passed");
    expect(content).toContain("repair workspace: prepared");
    expect(content).toContain("repair prompt: blocked (1 issue(s))");
    expect(content).toContain("repair prompt issues: repair contract has no non-passed audit evidence");
  });

  it("keeps long evidence summaries bounded", () => {
    const content = renderAuditRepairPlan({
      job: makeJob(),
      steps: [makeStep({ public_output: "x".repeat(400) })],
      repairChangeSummary: "clean",
    });

    const evidenceLine = content.split("\n").find((line) => line.startsWith("evidence summary:"));
    expect(evidenceLine?.length).toBeLessThanOrEqual(260);
    expect(evidenceLine).toContain("...");
  });
});
