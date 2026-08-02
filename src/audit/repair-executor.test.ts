import { describe, expect, it, vi } from "vitest";
import { buildAuditRepairContract, type AuditRepairContract } from "./repair-contract.js";
import { createAuditRepairCodexStarter } from "./repair-codex-starter.js";
import { startAuditRepairExecution } from "./repair-executor.js";
import { buildAuditRepairPrompt } from "./repair-prompt.js";
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
    worktree_path: "C:\\isolated\\worktree",
    branch_name: "audit-repair/audit-job-1",
    head_commit: "0123456789abcdef",
    status: "retained",
    created_at: "2026-08-02T10:02:00.000Z",
    updated_at: "2026-08-02T10:03:00.000Z",
    ...overrides,
  };
}

function makeContract(): AuditRepairContract {
  return buildAuditRepairContract({
    job: makeJob(),
    steps: [makeStep()],
    repairWorktree: makeRepairWorktree(),
    repairChangeSummary: "clean",
  });
}

describe("startAuditRepairExecution", () => {
  it("is disabled by default and does not call the Codex starter", async () => {
    const contract = makeContract();
    const startCodexRepair = vi.fn();

    const result = await startAuditRepairExecution({
      enabled: false,
      worktreePath: "C:\\isolated\\worktree",
      contract,
      prompt: buildAuditRepairPrompt(contract),
      startCodexRepair,
    });

    expect(result).toMatchObject({
      status: "disabled",
      summary: "audit repair execution disabled",
      threadId: null,
      turnId: null,
    });
    expect(startCodexRepair).not.toHaveBeenCalled();
  });

  it("rejects invalid contract or prompt before calling Codex", async () => {
    const contract = {
      ...makeContract(),
      allowedScope: "source worktree",
    };
    const startCodexRepair = vi.fn();

    const result = await startAuditRepairExecution({
      enabled: true,
      worktreePath: "C:\\isolated\\worktree",
      contract,
      prompt: "repair it",
      startCodexRepair,
    });

    expect(result.status).toBe("rejected");
    expect(result.summary).toBe("repair contract invalid");
    expect(result.issues).toContain("repair contract scope is not isolated");
    expect(startCodexRepair).not.toHaveBeenCalled();
  });

  it("rejects missing executor callback even when contract and prompt are valid", async () => {
    const contract = makeContract();

    const result = await startAuditRepairExecution({
      enabled: true,
      worktreePath: "C:\\isolated\\worktree",
      contract,
      prompt: buildAuditRepairPrompt(contract),
    });

    expect(result).toMatchObject({
      status: "rejected",
      summary: "repair executor not configured",
      threadId: null,
      turnId: null,
    });
    expect(result.issues).toContain("startCodexRepair callback missing");
  });

  it("starts through the injected Codex callback only after all gates pass", async () => {
    const contract = makeContract();
    const prompt = buildAuditRepairPrompt(contract);
    const startCodexRepair = vi.fn(async () => ({ threadId: "thread-1", turnId: "turn-1" }));

    const result = await startAuditRepairExecution({
      enabled: true,
      worktreePath: "C:\\isolated\\worktree",
      contract,
      prompt,
      startCodexRepair,
    });

    expect(result).toMatchObject({
      status: "started",
      summary: "repair Codex turn started in isolated worktree",
      threadId: "thread-1",
      turnId: "turn-1",
      issues: [],
    });
    expect(startCodexRepair).toHaveBeenCalledWith("C:\\isolated\\worktree", prompt);
  });

  it("can use the Codex starter adapter as the injected callback", async () => {
    const contract = makeContract();
    const prompt = buildAuditRepairPrompt(contract);
    const client = {
      startThread: vi.fn(async () => ({ id: "thread-1" })),
      startTurn: vi.fn(async () => ({ id: "turn-1" })),
    };

    const result = await startAuditRepairExecution({
      enabled: true,
      worktreePath: "C:\\isolated\\worktree",
      contract,
      prompt,
      startCodexRepair: createAuditRepairCodexStarter(client),
    });

    expect(result.status).toBe("started");
    expect(client.startThread).toHaveBeenCalledWith("C:\\isolated\\worktree");
    expect(client.startTurn).toHaveBeenCalledWith("thread-1", prompt);
  });
});
