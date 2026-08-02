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
  createAuditJob,
  getAuditRepairExecution,
  initDatabase,
  registerProject,
} from "../db/database.js";
import { defaultAuditCapabilities } from "./types.js";
import { buildAuditRepairContract, type AuditRepairContract } from "./repair-contract.js";
import { buildAuditRepairPrompt } from "./repair-prompt.js";
import { startTrackedAuditRepairExecution } from "./repair-execution-tracker.js";

function makeContract(): AuditRepairContract {
  return buildAuditRepairContract({
    job: {
      id: "audit-1",
      channel_id: "ch1",
      project_label: "/p1",
      mode: "approved-repair",
      status: "repairing",
      requested_check: "tests",
      current_step: "repair",
      iteration: 1,
      max_iterations: 2,
      stop_requested: 0,
      capabilities_json: "[]",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    },
    steps: [
      {
        id: "step-1",
        job_id: "audit-1",
        step_name: "tests",
        status: "failed",
        exit_code: 1,
        timed_out: 0,
        stopped: 0,
        public_output: "1 test failed",
        started_at: "2026-08-01T12:00:00.000Z",
        finished_at: "2026-08-01T12:00:01.000Z",
        duration_ms: 1_000,
        created_at: "2026-08-01T12:00:01.000Z",
      },
    ],
    repairWorktree: {
      job_id: "audit-1",
      worktree_path: "E:\\codex_works\\Attys_DC_BOT\\.discord-bot-state\\audit-worktrees\\audit-1",
      branch_name: "audit-repair/audit-1",
      head_commit: "0123456789abcdef",
      status: "prepared",
      created_at: "2026-08-01T12:01:00.000Z",
      updated_at: "2026-08-01T12:01:00.000Z",
    },
    repairChangeSummary: "clean",
  });
}

describe("tracked audit repair execution", () => {
  beforeEach(() => {
    initDatabase();
    registerProject("ch1", "/p1", "guild1");
    createAuditJob({
      id: "audit-1",
      channelId: "ch1",
      projectLabel: "/p1",
      mode: "approved-repair",
      status: "repairing",
      requestedCheck: "tests",
      currentStep: "repair",
      iteration: 1,
      maxIterations: 2,
      stopRequested: false,
      capabilities: defaultAuditCapabilities("approved-repair"),
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
    });
  });

  it("persists started Codex thread and turn identifiers after the executor starts", async () => {
    const contract = makeContract();
    const result = await startTrackedAuditRepairExecution({
      jobId: "audit-1",
      executionId: "repair-exec-1",
      enabled: true,
      contract,
      prompt: buildAuditRepairPrompt(contract),
      worktreePath: "E:\\codex_works\\Attys_DC_BOT\\.discord-bot-state\\audit-worktrees\\audit-1",
      startCodexRepair: async () => ({ threadId: "thread-1", turnId: "turn-1" }),
      now: vi
        .fn()
        .mockReturnValueOnce(new Date("2026-08-01T12:02:00.000Z"))
        .mockReturnValueOnce(new Date("2026-08-01T12:02:10.000Z")),
    });

    expect(result.status).toBe("started");
    expect(getAuditRepairExecution("repair-exec-1")).toMatchObject({
      job_id: "audit-1",
      status: "started",
      iteration: 1,
      thread_id: "thread-1",
      turn_id: "turn-1",
      result_summary: "repair Codex turn started in isolated worktree",
      created_at: "2026-08-01T12:02:00.000Z",
      updated_at: "2026-08-01T12:02:10.000Z",
    });
  });

  it("records fail-closed executor rejection without starting a Codex turn", async () => {
    const contract = makeContract();
    const result = await startTrackedAuditRepairExecution({
      jobId: "audit-1",
      executionId: "repair-exec-1",
      enabled: false,
      contract,
      prompt: buildAuditRepairPrompt(contract),
      worktreePath: "E:\\codex_works\\Attys_DC_BOT\\.discord-bot-state\\audit-worktrees\\audit-1",
      now: vi
        .fn()
        .mockReturnValueOnce(new Date("2026-08-01T12:02:00.000Z"))
        .mockReturnValueOnce(new Date("2026-08-01T12:02:10.000Z")),
    });

    expect(result.status).toBe("disabled");
    expect(getAuditRepairExecution("repair-exec-1")).toMatchObject({
      job_id: "audit-1",
      status: "failed",
      iteration: 1,
      thread_id: null,
      turn_id: null,
      result_summary: "audit repair execution disabled",
      updated_at: "2026-08-01T12:02:10.000Z",
    });
  });
});
