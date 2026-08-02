import { describe, expect, it } from "vitest";
import {
  AUDIT_REPAIR_CONTRACT_VERSION,
  buildAuditRepairContract,
  validateAuditRepairContract,
  type AuditRepairContract,
} from "./repair-contract.js";
import type { AuditJobRecord, AuditRepairWorktreeRecord, AuditStepRecord } from "../db/types.js";

function makeJob(overrides: Partial<AuditJobRecord> = {}): AuditJobRecord {
  return {
    id: "audit-job-1",
    channel_id: "channel-1",
    project_label: "C:\\Users\\secret\\project",
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
    public_output: "```FAIL``` tests: public-safe assertion summary",
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

describe("audit repair contract", () => {
  it("builds a public-safe isolated repair contract", () => {
    const contract = buildAuditRepairContract({
      job: makeJob(),
      steps: [makeStep()],
      repairWorktree: makeRepairWorktree(),
      repairChangeSummary: "files=1 staged=0 unstaged=1 untracked=0",
    });

    expect(contract.version).toBe(AUDIT_REPAIR_CONTRACT_VERSION);
    expect(contract.projectLabel).toBe("<local-path>/project");
    expect(contract.targetCheck).toBe("tests");
    expect(contract.latestEvidence?.summary).toContain("'''FAIL'''");
    expect(contract.repairWorkspace).toMatchObject({
      status: "retained",
      branchName: "audit-repair/audit-job-1",
      headCommit: "0123456789ab",
    });
    expect(contract.allowedScope).toBe("isolated repair worktree only");
    expect(contract.blockedActions).toContain("source worktree write");
    expect(contract.blockedActions).toContain("push");
    expect(validateAuditRepairContract(contract)).toEqual([]);
  });

  it("detects contract drift before future execution can rely on it", () => {
    const contract = buildAuditRepairContract({
      job: makeJob(),
      steps: [makeStep()],
      repairChangeSummary: "unavailable",
    });
    const broken: AuditRepairContract = {
      ...contract,
      allowedScope: "source worktree",
      blockedActions: contract.blockedActions.filter((action) => action !== "push"),
      requiredValidation: "none",
    };

    expect(validateAuditRepairContract(broken)).toEqual([
      "repair contract scope is not isolated",
      "repair contract does not block push",
      "repair contract does not require isolated recheck validation",
    ]);
  });
});
