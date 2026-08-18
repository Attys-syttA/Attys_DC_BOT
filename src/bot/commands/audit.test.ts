import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getProject: vi.fn(),
  getActiveAuditJob: vi.fn(),
  getActiveAuditJobByProjectPath: vi.fn(),
  getAuditJob: vi.fn(),
  getAuditRepairWorktree: vi.fn(),
  getLatestAuditJob: vi.fn(),
  createAuditJob: vi.fn(),
  updateAuditJobProgress: vi.fn(),
  updateAuditRepairWorktreeStatus: vi.fn(),
  requestAuditJobStop: vi.fn(),
  insertAuditStepResult: vi.fn(),
  listAuditRepairExecutions: vi.fn(),
  listAuditSteps: vi.fn(),
  updateAuditRepairExecutionResult: vi.fn(),
  createAuditRepairCodexStarter: vi.fn(),
  applyRepairWorktreeChanges: vi.fn(),
  revertAppliedRepairWorktreeChanges: vi.fn(),
  startTrackedAuditRepairExecution: vi.fn(),
  runAuditCheckPipeline: vi.fn(),
  inspectRepairWorktreeChanges: vi.fn(),
  removeAppliedRepairWorktree: vi.fn(),
  removeRepairWorktree: vi.fn(),
  removeRevertedRepairWorktree: vi.fn(),
  recordOperatorEvent: vi.fn(),
}));

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    randomUUID: () => "audit-job-1",
  };
});

vi.mock("../../utils/config.js", () => ({
  getConfig: mocks.getConfig,
}));

vi.mock("../../db/database.js", () => ({
  getProject: mocks.getProject,
  getActiveAuditJob: mocks.getActiveAuditJob,
  getActiveAuditJobByProjectPath: mocks.getActiveAuditJobByProjectPath,
  getAuditJob: mocks.getAuditJob,
  getAuditRepairWorktree: mocks.getAuditRepairWorktree,
  getLatestAuditJob: mocks.getLatestAuditJob,
  createAuditJob: mocks.createAuditJob,
  updateAuditJobProgress: mocks.updateAuditJobProgress,
  updateAuditRepairWorktreeStatus: mocks.updateAuditRepairWorktreeStatus,
  requestAuditJobStop: mocks.requestAuditJobStop,
  insertAuditStepResult: mocks.insertAuditStepResult,
  listAuditRepairExecutions: mocks.listAuditRepairExecutions,
  listAuditSteps: mocks.listAuditSteps,
  updateAuditRepairExecutionResult: mocks.updateAuditRepairExecutionResult,
}));

vi.mock("../../audit/repair-codex-starter.js", () => ({
  createAuditRepairCodexStarter: mocks.createAuditRepairCodexStarter,
}));

vi.mock("../../audit/repair-apply.js", () => ({
  applyRepairWorktreeChanges: mocks.applyRepairWorktreeChanges,
  revertAppliedRepairWorktreeChanges: mocks.revertAppliedRepairWorktreeChanges,
}));

vi.mock("../../audit/repair-execution-tracker.js", () => ({
  startTrackedAuditRepairExecution: mocks.startTrackedAuditRepairExecution,
}));

vi.mock("../../audit/check-runner.js", () => ({
  runAuditCheckPipeline: mocks.runAuditCheckPipeline,
}));

vi.mock("../../audit/worktree-manager.js", () => ({
  inspectRepairWorktreeChanges: mocks.inspectRepairWorktreeChanges,
  removeAppliedRepairWorktree: mocks.removeAppliedRepairWorktree,
  removeRepairWorktree: mocks.removeRepairWorktree,
  removeRevertedRepairWorktree: mocks.removeRevertedRepairWorktree,
}));

vi.mock("../operator-events.js", () => ({
  recordOperatorEvent: mocks.recordOperatorEvent,
}));

import { execute } from "./audit.js";
import type { AuditCheckName } from "../../audit/check-catalog.js";
import type { AuditCheckRunnerOptions } from "../../audit/check-runner.js";

function makeInteraction(
  subcommand: "start" | "status" | "review" | "repair-plan" | "stop" | "repair" | "repair-run" | "repair-reviewed" | "repair-cleanup" | "repair-apply" | "repair-revert" | "recheck",
  check = "tests",
  stringOptions: Record<string, string | null> = {},
  integerOptions: Record<string, number | null> = {},
) {
  return {
    channelId: "channel-1",
    options: {
      getSubcommand: vi.fn(() => subcommand),
      getString: vi.fn((name: string) => {
        if (Object.prototype.hasOwnProperty.call(stringOptions, name)) return stringOptions[name];
        return name === "check" ? check : null;
      }),
      getInteger: vi.fn((name: string) => {
        if (Object.prototype.hasOwnProperty.call(integerOptions, name)) return integerOptions[name];
        return null;
      }),
    },
    editReply: vi.fn(),
    followUp: vi.fn(),
  };
}

function makeJob(overrides = {}) {
  return {
    id: "audit-job-1",
    channel_id: "channel-1",
    project_label: "<local-path>/app",
    mode: "check-only",
    status: "completed",
    requested_check: "tests",
    current_step: null,
    iteration: 0,
    max_iterations: 2,
    stop_requested: 0,
    capabilities_json: "[]",
    created_at: "2026-08-01T12:00:00.000Z",
    updated_at: "2026-08-01T12:00:01.000Z",
    ...overrides,
  };
}

function makeStep(overrides = {}) {
  return {
    id: "step-1",
    job_id: "audit-job-1",
    step_name: "tests",
    status: "passed",
    exit_code: 0,
    timed_out: 0,
    stopped: 0,
    public_output: "ok",
    started_at: "2026-08-01T12:00:00.000Z",
    finished_at: "2026-08-01T12:00:01.000Z",
    duration_ms: 1_000,
    created_at: "2026-08-01T12:00:01.000Z",
    ...overrides,
  };
}

describe("/audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_AUDIT: true, DISCORD_ENABLE_AUDIT_REPAIR: true });
    mocks.getProject.mockReturnValue({ channel_id: "channel-1", project_path: "/projects/app", guild_id: "guild-1" });
    mocks.getActiveAuditJob.mockReturnValue(undefined);
    mocks.getActiveAuditJobByProjectPath.mockReturnValue(undefined);
    mocks.getAuditJob.mockReturnValue(makeJob());
    mocks.getAuditRepairWorktree.mockReturnValue(undefined);
    mocks.getLatestAuditJob.mockReturnValue(makeJob());
    mocks.listAuditRepairExecutions.mockReturnValue([]);
    mocks.listAuditSteps.mockReturnValue([makeStep()]);
    mocks.createAuditRepairCodexStarter.mockReturnValue(vi.fn());
    mocks.applyRepairWorktreeChanges.mockResolvedValue({
      changedFiles: 1,
      summary: "applied files=1",
      validationPassed: true,
      validationResults: [{
        name: "tests",
        status: "passed",
        exitCode: 0,
        timedOut: false,
        stopped: false,
        publicOutput: "ok",
        startedAt: "2026-08-01T12:00:02.000Z",
        finishedAt: "2026-08-01T12:00:03.000Z",
        durationMs: 1_000,
      }],
    });
    mocks.revertAppliedRepairWorktreeChanges.mockResolvedValue({
      changedFiles: 1,
      summary: "reverted files=1",
      validationPassed: true,
      validationResults: [{
        name: "tests",
        status: "passed",
        exitCode: 0,
        timedOut: false,
        stopped: false,
        publicOutput: "ok",
        startedAt: "2026-08-01T12:00:04.000Z",
        finishedAt: "2026-08-01T12:00:05.000Z",
        durationMs: 1_000,
      }],
    });
    mocks.startTrackedAuditRepairExecution.mockResolvedValue({
      status: "started",
      summary: "repair Codex turn started in isolated worktree",
      threadId: "thread-1",
      turnId: "turn-1",
      issues: [],
    });
    mocks.inspectRepairWorktreeChanges.mockReturnValue({
      available: false,
      summary: "unavailable",
      changedFiles: 0,
      staged: 0,
      unstaged: 0,
      untracked: 0,
    });
    mocks.removeRepairWorktree.mockResolvedValue({ removed: true, summary: "removed" });
    mocks.removeAppliedRepairWorktree.mockResolvedValue({ removed: true, summary: "removed" });
    mocks.removeRevertedRepairWorktree.mockResolvedValue({ removed: true, summary: "removed" });
    mocks.runAuditCheckPipeline.mockResolvedValue([{
      name: "tests",
      status: "passed",
      exitCode: 0,
      timedOut: false,
      stopped: false,
      publicOutput: "ok",
      startedAt: "2026-08-01T12:00:00.000Z",
      finishedAt: "2026-08-01T12:00:01.000Z",
      durationMs: 1_000,
    }]);
  });

  it("is disabled unless explicitly enabled", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_AUDIT: false });
    const interaction = makeInteraction("start");

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "`/audit` is disabled. Set `DISCORD_ENABLE_AUDIT=true` in `.env` to enable it.",
    });
    expect(mocks.runAuditCheckPipeline).not.toHaveBeenCalled();
  });

  it("requires a registered project", async () => {
    mocks.getProject.mockReturnValue(undefined);
    const interaction = makeInteraction("start");

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "This channel is not registered to any project.",
    });
    expect(mocks.runAuditCheckPipeline).not.toHaveBeenCalled();
  });

  it("runs a read-only named check and stores the result", async () => {
    const interaction = makeInteraction("start", "tests");

    await execute(interaction as never);

    expect(mocks.createAuditJob).toHaveBeenCalledWith(expect.objectContaining({
      id: "audit-job-1",
      channelId: "channel-1",
      projectLabel: "<local-path>/app",
      mode: "check-only",
      status: "running_checks",
      currentStep: "tests",
      maxIterations: 2,
    }));
    expect(mocks.runAuditCheckPipeline).toHaveBeenCalledWith("/projects/app", "tests", {
      signal: expect.any(AbortSignal),
      shouldStop: expect.any(Function),
    });
    expect(mocks.insertAuditStepResult).toHaveBeenCalledWith("audit-job-1", expect.objectContaining({
      name: "tests",
      status: "passed",
    }));
    expect(mocks.recordOperatorEvent).toHaveBeenCalledWith({
      kind: "task",
      status: "audit-check-passed",
      channelId: "channel-1",
    });
    expect(mocks.updateAuditJobProgress).toHaveBeenCalledWith(
      "audit-job-1",
      "completed",
      null,
      0,
      expect.any(String),
    );
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: expect.stringContaining("**Audit completed**"),
    });
  });

  it("accepts an explicit bounded audit iteration budget up to three", async () => {
    const interaction = makeInteraction("start", "tests", {}, { max_iterations: 3 });

    await execute(interaction as never);

    expect(mocks.createAuditJob).toHaveBeenCalledWith(expect.objectContaining({
      maxIterations: 3,
    }));
    expect(mocks.runAuditCheckPipeline).toHaveBeenCalledWith("/projects/app", "tests", {
      signal: expect.any(AbortSignal),
      shouldStop: expect.any(Function),
    });
  });

  it("rejects an audit iteration budget above the hard maximum", async () => {
    const interaction = makeInteraction("start", "tests", {}, { max_iterations: 4 });

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Unsupported audit iteration budget: 4. Use 1-3.",
    });
    expect(mocks.createAuditJob).not.toHaveBeenCalled();
    expect(mocks.runAuditCheckPipeline).not.toHaveBeenCalled();
  });

  it("blocks a new audit when the same project already has an active job in another channel", async () => {
    mocks.getActiveAuditJobByProjectPath.mockReturnValue(makeJob({
      id: "audit-other-channel",
      channel_id: "channel-2",
      status: "waiting_nas_result",
      current_step: "plans",
    }));
    const interaction = makeInteraction("start", "tests");

    await execute(interaction as never);

    expect(mocks.getActiveAuditJobByProjectPath).toHaveBeenCalledWith("guild-1", "/projects/app");
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: expect.stringContaining("already active for this project"),
    });
    expect(mocks.createAuditJob).not.toHaveBeenCalled();
    expect(mocks.runAuditCheckPipeline).not.toHaveBeenCalled();
  });

  it("reports failed checks as waiting for manual review", async () => {
    mocks.runAuditCheckPipeline.mockResolvedValue([{
      name: "tests",
      status: "failed",
      exitCode: 1,
      timedOut: false,
      stopped: false,
      publicOutput: "failed",
      startedAt: "2026-08-01T12:00:00.000Z",
      finishedAt: "2026-08-01T12:00:01.000Z",
      durationMs: 1_000,
    }]);
    mocks.listAuditSteps.mockReturnValue([makeStep({ status: "failed", exit_code: 1 })]);
    mocks.getLatestAuditJob.mockReturnValue(makeJob({ status: "waiting_manual_review" }));
    const interaction = makeInteraction("start", "tests");

    await execute(interaction as never);

    expect(mocks.updateAuditJobProgress).toHaveBeenCalledWith(
      "audit-job-1",
      "waiting_manual_review",
      null,
      0,
      expect.any(String),
    );
    expect(mocks.recordOperatorEvent).toHaveBeenCalledWith({
      kind: "task",
      status: "audit-check-failed",
      channelId: "channel-1",
    });
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: expect.stringContaining("**Audit waiting_manual_review**"),
    });
  });

  it("marks stopped pipeline results as stopped", async () => {
    mocks.runAuditCheckPipeline.mockResolvedValue([{
      name: "tests",
      status: "stopped",
      exitCode: null,
      timedOut: false,
      stopped: true,
      publicOutput: "stop requested before command start",
      startedAt: "2026-08-01T12:00:00.000Z",
      finishedAt: "2026-08-01T12:00:01.000Z",
      durationMs: 1_000,
    }]);
    mocks.listAuditSteps.mockReturnValue([makeStep({
      status: "stopped",
      exit_code: null,
      stopped: 1,
    })]);
    mocks.getLatestAuditJob.mockReturnValue(makeJob({ status: "stopped" }));
    const interaction = makeInteraction("start", "tests");

    await execute(interaction as never);

    expect(mocks.updateAuditJobProgress).toHaveBeenCalledWith(
      "audit-job-1",
      "stopped",
      null,
      0,
      expect.any(String),
    );
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: expect.stringContaining("**Audit stopped**"),
    });
  });

  it("marks the job failed when the runner throws", async () => {
    mocks.runAuditCheckPipeline.mockRejectedValue(new Error("boom"));
    const interaction = makeInteraction("start", "tests");

    await execute(interaction as never);

    expect(mocks.updateAuditJobProgress).toHaveBeenCalledWith(
      "audit-job-1",
      "failed",
      null,
      0,
      expect.any(String),
    );
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: expect.stringContaining("reason: check runner error"),
    });
  });

  it("shows latest status from the store", async () => {
    const interaction = makeInteraction("status");

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: expect.stringContaining("**Latest audit job**"),
    });
  });

  it("shows repair worktree status without leaking the local path", async () => {
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "prepared",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    });
    const interaction = makeInteraction("status");

    await execute(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("repair worktree:");
    expect(content).toContain("- status: prepared");
    expect(content).toContain("- branch: audit-repair/audit-job-1");
    expect(content).toContain("- head: 0123456789ab");
    expect(content).toContain("- changes: unavailable");
    expect(content).not.toContain("/projects/app");
    expect(content).not.toContain(".discord-bot-state");
  });

  it("does not inspect removed repair worktree paths in audit status", async () => {
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "removed",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:01.000Z",
    });
    const interaction = makeInteraction("status");

    await execute(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("- status: removed");
    expect(content).toContain("- changes: removed");
    expect(mocks.inspectRepairWorktreeChanges).not.toHaveBeenCalled();
  });

  it("shows public-safe repair execution tracking in audit status", async () => {
    mocks.listAuditRepairExecutions.mockReturnValue([{
      id: "repair-exec-1",
      job_id: "audit-job-1",
      status: "started",
      iteration: 0,
      thread_id: "thread-1234567890abcdef",
      turn_id: "turn-1234567890abcdef",
      result_summary: "repair Codex turn started in <local-path>",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:10.000Z",
    }]);
    const interaction = makeInteraction("status");

    await execute(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("repair executions:");
    expect(content).toContain("- started: thread=thread-12345 turn=turn-1234567 summary=repair Codex turn started in <local-path>");
    expect(content).not.toContain("repair-exec-1");
    expect(content).not.toContain("1234567890abcdef");
  });

  it("shows public-safe audit review guidance without starting repair", async () => {
    mocks.getLatestAuditJob.mockReturnValue(makeJob({ status: "waiting_manual_review" }));
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "retained",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    });
    const interaction = makeInteraction("review");

    await execute(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("**Audit review**");
    expect(content).toContain("decision: manual review required");
    expect(content).toContain("repair workspace: retained");
    expect(content).toContain("repair changes: unavailable");
    expect(content).toContain("latest repair execution: none");
    expect(content).toContain("allowed next actions: /audit status, /audit review, /audit repair-plan, /audit repair-run, /audit recheck");
    expect(content).toContain("blocked actions: automatic merge, commit, push, source worktree write");
    expect(content).not.toContain("/projects/app");
    expect(content).not.toContain(".discord-bot-state");
    expect(mocks.runAuditCheckPipeline).not.toHaveBeenCalled();
    expect(mocks.updateAuditJobProgress).not.toHaveBeenCalled();
  });

  it("shows repair-reviewed as the next review action for a started repair execution", async () => {
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      status: "waiting_manual_review",
      iteration: 1,
    }));
    mocks.listAuditRepairExecutions.mockReturnValue([{
      id: "repair-exec-1",
      job_id: "audit-job-1",
      status: "started",
      iteration: 1,
      thread_id: "thread-1",
      turn_id: "turn-1",
      result_summary: "repair Codex turn started in isolated worktree",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:10.000Z",
    }]);
    const interaction = makeInteraction("review");

    await execute(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("latest repair execution: started: thread=thread-1 turn=turn-1 summary=repair Codex turn started in isolated worktree");
    expect(content).toContain("allowed next actions: /audit status, /audit review, /audit repair-reviewed");
  });

  it("shows recheck as the next review action for a reviewed repair execution", async () => {
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      status: "waiting_manual_review",
      iteration: 1,
    }));
    mocks.listAuditRepairExecutions.mockReturnValue([{
      id: "repair-exec-1",
      job_id: "audit-job-1",
      status: "reviewed",
      iteration: 1,
      thread_id: "thread-1",
      turn_id: "turn-1",
      result_summary: "operator marked repair execution reviewed",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:10.000Z",
    }]);
    const interaction = makeInteraction("review");

    await execute(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("latest repair execution: reviewed: thread=thread-1 turn=turn-1 summary=operator marked repair execution reviewed");
    expect(content).toContain("allowed next actions: /audit status, /audit review, /audit recheck");
  });

  it("shows a new repair-run option after a failed recheck advances the iteration", async () => {
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      status: "waiting_manual_review",
      requested_check: "tests",
      iteration: 1,
      max_iterations: 2,
    }));
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "retained",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:01:00.000Z",
    });
    mocks.listAuditRepairExecutions.mockReturnValue([{
      id: "repair-exec-1",
      job_id: "audit-job-1",
      status: "reviewed",
      iteration: 0,
      thread_id: "thread-1",
      turn_id: "turn-1",
      result_summary: "operator marked repair execution reviewed",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:10.000Z",
    }]);
    const interaction = makeInteraction("review");

    await execute(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("iteration budget: 1/2 (1 recheck(s) left)");
    expect(content).toContain("latest repair execution: reviewed: thread=thread-1 turn=turn-1 summary=operator marked repair execution reviewed");
    expect(content).toContain("allowed next actions: /audit status, /audit review, /audit repair-plan, /audit repair-run, /audit recheck");
  });

  it("does not suggest repair or recheck when the review budget is exhausted", async () => {
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      status: "waiting_manual_review",
      requested_check: "tests",
      iteration: 2,
      max_iterations: 2,
    }));
    const interaction = makeInteraction("review");

    await execute(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("iteration budget: 2/2 (exhausted)");
    expect(content).toContain("allowed next actions: /audit status, /audit review");
    expect(content).not.toContain("allowed next actions: /audit status, /audit repair, /audit recheck");
  });

  it("does not suggest recheck after reviewed repair execution when the budget is exhausted", async () => {
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      status: "waiting_manual_review",
      requested_check: "tests",
      iteration: 2,
      max_iterations: 2,
    }));
    mocks.listAuditRepairExecutions.mockReturnValue([{
      id: "repair-exec-1",
      job_id: "audit-job-1",
      status: "reviewed",
      iteration: 2,
      thread_id: "thread-1",
      turn_id: "turn-1",
      result_summary: "operator marked repair execution reviewed",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:10.000Z",
    }]);
    const interaction = makeInteraction("review");

    await execute(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("latest repair execution: reviewed: thread=thread-1 turn=turn-1 summary=operator marked repair execution reviewed");
    expect(content).toContain("allowed next actions: /audit status, /audit review");
    expect(content).not.toContain("allowed next actions: /audit status, /audit review, /audit recheck");
  });

  it("shows repair-cleanup as the next review action for terminal jobs with a retained repair workspace", async () => {
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      status: "stagnated",
      requested_check: "tests",
      iteration: 2,
    }));
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "retained",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:01.000Z",
    });
    const interaction = makeInteraction("review");

    await execute(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("decision: stagnated; manual review required");
    expect(content).toContain("repair workspace: retained");
    expect(content).toContain("allowed next actions: /audit status, /audit review, /audit repair-cleanup");
  });

  it("shows source handoff guidance after an applied repair workspace was cleaned up", async () => {
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      status: "completed",
      requested_check: "tests",
      iteration: 1,
    }));
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "applied_removed",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:01.000Z",
    });
    const interaction = makeInteraction("review");

    await execute(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("repair workspace: applied_removed");
    expect(content).toContain("repair changes: removed");
    expect(content).toContain("source handoff: applied repair result is in the normal source worktree");
    expect(content).toContain("source next action: manually review, then commit or revert outside /audit");
    expect(content).toContain("allowed next actions: /audit status, /audit review");
    expect(mocks.inspectRepairWorktreeChanges).not.toHaveBeenCalled();
  });

  it("shows repair-revert as the next action while an applied repair workspace is still available", async () => {
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      status: "completed",
      requested_check: "tests",
      iteration: 1,
    }));
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "applied",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:01.000Z",
    });
    mocks.inspectRepairWorktreeChanges.mockReturnValue({
      available: true,
      summary: "files=1 staged=0 unstaged=1 untracked=0",
      changedFiles: 1,
      staged: 0,
      unstaged: 1,
      untracked: 0,
    });
    const interaction = makeInteraction("review");

    await execute(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("repair workspace: applied");
    expect(content).toContain("source next action: manually review, then commit outside /audit or run /audit repair-revert before cleanup");
    expect(content).toContain("allowed next actions: /audit status, /audit review, /audit repair-revert, /audit repair-cleanup");
  });

  it("shows reverted source handoff guidance after repair-revert", async () => {
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      status: "completed",
      requested_check: "tests",
      iteration: 1,
    }));
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "reverted",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:01.000Z",
    });
    const interaction = makeInteraction("review");

    await execute(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("repair workspace: reverted");
    expect(content).toContain("source handoff: reverted from the normal source worktree");
    expect(content).toContain("source next action: review source status; no audit commit is pending");
    expect(content).toContain("allowed next actions: /audit status, /audit review, /audit repair-cleanup");
  });

  it("shows a public-safe repair plan contract without starting repair", async () => {
    mocks.getLatestAuditJob.mockReturnValue(makeJob({ status: "waiting_manual_review" }));
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "retained",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    });
    mocks.listAuditSteps.mockReturnValue([makeStep({
      status: "failed",
      public_output: "FAIL tests: public-safe assertion summary",
    })]);
    const interaction = makeInteraction("repair-plan");

    await execute(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("**Audit repair plan**");
    expect(content).toContain("repair contract: preview only");
    expect(content).toContain("repair workspace: retained");
    expect(content).toContain("required validation: rerun the original named check through /audit recheck");
    expect(content).toContain("repair prompt: ready");
    expect(content).toContain("blocked actions: source worktree write, automatic merge, commit, push");
    expect(content).not.toContain("/projects/app");
    expect(content).not.toContain(".discord-bot-state");
    expect(mocks.runAuditCheckPipeline).not.toHaveBeenCalled();
    expect(mocks.updateAuditJobProgress).not.toHaveBeenCalled();
  });

  it("requests stop for an active job", async () => {
    mocks.getActiveAuditJob.mockReturnValue(makeJob({ status: "running_checks", current_step: "tests" }));
    const interaction = makeInteraction("stop");

    await execute(interaction as never);

    expect(mocks.requestAuditJobStop).toHaveBeenCalledWith("audit-job-1", expect.any(String));
    expect(mocks.updateAuditJobProgress).toHaveBeenCalledWith(
      "audit-job-1",
      "stopped",
      null,
      0,
      expect.any(String),
    );
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Stop requested for audit job `audit-jo...`; job marked stopped.",
    });
  });

  it("marks a waiting manual-review audit job stopped without running repair cleanup", async () => {
    mocks.getActiveAuditJob.mockReturnValue(makeJob({
      status: "waiting_manual_review",
      current_step: null,
      iteration: 1,
    }));
    const interaction = makeInteraction("stop");

    await execute(interaction as never);

    expect(mocks.requestAuditJobStop).toHaveBeenCalledWith("audit-job-1", expect.any(String));
    expect(mocks.updateAuditJobProgress).toHaveBeenCalledWith(
      "audit-job-1",
      "stopped",
      null,
      1,
      expect.any(String),
    );
    expect(mocks.updateAuditRepairWorktreeStatus).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Stop requested for audit job `audit-jo...`; job marked stopped.",
    });
  });

  it("aborts the in-process audit runner when stop is requested while it is still running", async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolvePipeline!: (value: unknown) => void;
    mocks.runAuditCheckPipeline.mockImplementation(((
      _projectPath: string,
      _check: AuditCheckName,
      options: AuditCheckRunnerOptions,
    ) => {
      capturedSignal = options.signal;
      return new Promise((resolve) => {
        resolvePipeline = resolve;
      });
    }) as never);
    const startInteraction = makeInteraction("start", "tests");
    const startPromise = execute(startInteraction as never);
    await vi.waitFor(() => expect(capturedSignal).toBeDefined());

    mocks.getActiveAuditJob.mockReturnValue(makeJob({ status: "running_checks", current_step: "tests" }));
    const stopInteraction = makeInteraction("stop");

    await execute(stopInteraction as never);

    expect(capturedSignal!.aborted).toBe(true);
    expect(stopInteraction.editReply).toHaveBeenCalledWith({
      content: "Stop requested for audit job `audit-jo...`; running process abort requested.",
    });

    mocks.listAuditSteps.mockReturnValue([makeStep({ status: "stopped", stopped: 1, exit_code: null })]);
    mocks.getLatestAuditJob.mockReturnValue(makeJob({ status: "stopped" }));
    resolvePipeline([{
      name: "tests",
      status: "stopped",
      exitCode: null,
      timedOut: false,
      stopped: true,
      publicOutput: "stopped",
      startedAt: "2026-08-01T12:00:00.000Z",
      finishedAt: "2026-08-01T12:00:01.000Z",
      durationMs: 1_000,
    }]);
    await startPromise;
  });

  it("does not request repair approval unless repair is explicitly enabled", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_AUDIT: true, DISCORD_ENABLE_AUDIT_REPAIR: false });
    const interaction = makeInteraction("repair");

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "`/audit repair` is disabled. Set `DISCORD_ENABLE_AUDIT_REPAIR=true` in `.env` to enable it.",
    });
    expect(mocks.updateAuditJobProgress).not.toHaveBeenCalled();
  });

  it("requests explicit approval before any repair worktree is prepared", async () => {
    mocks.getLatestAuditJob.mockReturnValue(makeJob({ status: "waiting_manual_review" }));
    const interaction = makeInteraction("repair");

    await execute(interaction as never);

    expect(mocks.updateAuditJobProgress).toHaveBeenCalledWith(
      "audit-job-1",
      "waiting_repair_approval",
      null,
      0,
      expect.any(String),
    );
    expect(mocks.recordOperatorEvent).toHaveBeenCalledWith({
      kind: "task",
      status: "audit-repair-waiting",
      channelId: "channel-1",
    });
    const payload = interaction.editReply.mock.calls[0][0];
    expect(payload.content).toContain("No repair, worktree, Codex turn");
    expect(payload.components[0].components[0].data.custom_id).toBe("audit-repair-approve:audit-job-1");
  });

  it("keeps audit repair execution disabled behind a separate flag", async () => {
    mocks.getConfig.mockReturnValue({
      DISCORD_ENABLE_AUDIT: true,
      DISCORD_ENABLE_AUDIT_REPAIR: true,
      DISCORD_ENABLE_AUDIT_REPAIR_EXECUTION: false,
    });
    const interaction = makeInteraction("repair-run");

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "`/audit repair-run` is disabled.\nSet `DISCORD_ENABLE_AUDIT_REPAIR_EXECUTION=true` only after reviewing `/audit repair-plan`.",
    });
    expect(mocks.startTrackedAuditRepairExecution).not.toHaveBeenCalled();
  });

  it("starts one tracked isolated repair execution only when explicitly enabled", async () => {
    mocks.getConfig.mockReturnValue({
      DISCORD_ENABLE_AUDIT: true,
      DISCORD_ENABLE_AUDIT_REPAIR: true,
      DISCORD_ENABLE_AUDIT_REPAIR_EXECUTION: true,
    });
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      mode: "approved-repair",
      status: "waiting_manual_review",
      requested_check: "tests",
    }));
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "prepared",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    });
    mocks.listAuditSteps.mockReturnValue([makeStep({ status: "failed", exit_code: 1 })]);
    const startCodexRepair = vi.fn();
    mocks.createAuditRepairCodexStarter.mockReturnValue(startCodexRepair);
    const interaction = makeInteraction("repair-run");

    await execute(interaction as never);

    expect(mocks.updateAuditJobProgress).toHaveBeenCalledWith(
      "audit-job-1",
      "repairing",
      "repair",
      0,
      expect.any(String),
    );
    expect(mocks.startTrackedAuditRepairExecution).toHaveBeenCalledWith(expect.objectContaining({
      jobId: "audit-job-1",
      executionId: "audit-job-1",
      enabled: true,
      worktreePath: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      startCodexRepair,
    }));
    expect(mocks.updateAuditJobProgress).toHaveBeenCalledWith(
      "audit-job-1",
      "waiting_manual_review",
      null,
      0,
      expect.any(String),
    );
    const content = interaction.followUp.mock.calls[0][0].content;
    expect(content).toContain("**Audit repair execution started**");
    expect(content).toContain("thread: thread-1");
    expect(content).not.toContain("/projects/app");
    expect(content).not.toContain(".discord-bot-state");
  });

  it("rejects repair-run when there is no failed audit evidence", async () => {
    mocks.getConfig.mockReturnValue({
      DISCORD_ENABLE_AUDIT: true,
      DISCORD_ENABLE_AUDIT_REPAIR: true,
      DISCORD_ENABLE_AUDIT_REPAIR_EXECUTION: true,
    });
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      mode: "approved-repair",
      status: "waiting_manual_review",
      requested_check: "tests",
    }));
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "prepared",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    });
    mocks.listAuditSteps.mockReturnValue([makeStep({ status: "passed" })]);
    const interaction = makeInteraction("repair-run");

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Audit job `audit-jo...` has no failed or unsupported audit evidence to repair.",
    });
    expect(mocks.startTrackedAuditRepairExecution).not.toHaveBeenCalled();
  });

  it("rejects repair-run when the iteration budget is exhausted", async () => {
    mocks.getConfig.mockReturnValue({
      DISCORD_ENABLE_AUDIT: true,
      DISCORD_ENABLE_AUDIT_REPAIR: true,
      DISCORD_ENABLE_AUDIT_REPAIR_EXECUTION: true,
    });
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      mode: "approved-repair",
      status: "waiting_manual_review",
      requested_check: "tests",
      iteration: 2,
      max_iterations: 2,
    }));
    const interaction = makeInteraction("repair-run");

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Audit job `audit-jo...` has reached its repair-run budget (2/2).",
    });
    expect(mocks.getAuditRepairWorktree).not.toHaveBeenCalled();
    expect(mocks.startTrackedAuditRepairExecution).not.toHaveBeenCalled();
  });

  it("rejects a second repair-run in the same audit iteration", async () => {
    mocks.getConfig.mockReturnValue({
      DISCORD_ENABLE_AUDIT: true,
      DISCORD_ENABLE_AUDIT_REPAIR: true,
      DISCORD_ENABLE_AUDIT_REPAIR_EXECUTION: true,
    });
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      mode: "approved-repair",
      status: "waiting_manual_review",
      requested_check: "tests",
      iteration: 1,
    }));
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "prepared",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    });
    mocks.listAuditSteps.mockReturnValue([makeStep({ status: "failed", exit_code: 1 })]);
    mocks.listAuditRepairExecutions.mockReturnValue([{
      id: "repair-exec-1",
      job_id: "audit-job-1",
      status: "started",
      iteration: 1,
      thread_id: "thread-1",
      turn_id: "turn-1",
      result_summary: "repair Codex turn started in isolated worktree",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:10.000Z",
    }]);
    const interaction = makeInteraction("repair-run");

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Audit job `audit-jo...` already has a started repair execution for iteration 1; run /audit recheck before starting another one.",
    });
    expect(mocks.startTrackedAuditRepairExecution).not.toHaveBeenCalled();
  });

  it("rejects a second repair-run after the same iteration was marked reviewed", async () => {
    mocks.getConfig.mockReturnValue({
      DISCORD_ENABLE_AUDIT: true,
      DISCORD_ENABLE_AUDIT_REPAIR: true,
      DISCORD_ENABLE_AUDIT_REPAIR_EXECUTION: true,
    });
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      mode: "approved-repair",
      status: "waiting_manual_review",
      requested_check: "tests",
      iteration: 1,
    }));
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "prepared",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    });
    mocks.listAuditSteps.mockReturnValue([makeStep({ status: "failed", exit_code: 1 })]);
    mocks.listAuditRepairExecutions.mockReturnValue([{
      id: "repair-exec-1",
      job_id: "audit-job-1",
      status: "reviewed",
      iteration: 1,
      thread_id: "thread-1",
      turn_id: "turn-1",
      result_summary: "operator marked repair execution reviewed",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:10.000Z",
    }]);
    const interaction = makeInteraction("repair-run");

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Audit job `audit-jo...` already has a reviewed repair execution for iteration 1; run /audit recheck before starting another one.",
    });
    expect(mocks.startTrackedAuditRepairExecution).not.toHaveBeenCalled();
  });

  it("marks the latest started repair execution as reviewed", async () => {
    mocks.getConfig.mockReturnValue({
      DISCORD_ENABLE_AUDIT: true,
      DISCORD_ENABLE_AUDIT_REPAIR: true,
    });
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      mode: "approved-repair",
      status: "waiting_manual_review",
      requested_check: "tests",
      iteration: 1,
    }));
    mocks.listAuditRepairExecutions.mockReturnValue([{
      id: "repair-exec-1",
      job_id: "audit-job-1",
      status: "started",
      iteration: 1,
      thread_id: "thread-1",
      turn_id: "turn-1",
      result_summary: "repair Codex turn started in isolated worktree",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:10.000Z",
    }]);
    const interaction = makeInteraction("repair-reviewed");

    await execute(interaction as never);

    expect(mocks.updateAuditRepairExecutionResult).toHaveBeenCalledWith(
      "repair-exec-1",
      "reviewed",
      "operator marked repair execution reviewed",
      expect.any(String),
      "thread-1",
      "turn-1",
    );
    expect(mocks.recordOperatorEvent).toHaveBeenCalledWith({
      kind: "task",
      status: "audit-repair-reviewed",
      channelId: "channel-1",
    });
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Audit job `audit-jo...` repair execution was marked reviewed.\nNext: run `/audit recheck` to validate the isolated repair workspace.",
    });
  });

  it("stores a public-safe review note when marking repair execution reviewed", async () => {
    mocks.getConfig.mockReturnValue({
      DISCORD_ENABLE_AUDIT: true,
      DISCORD_ENABLE_AUDIT_REPAIR: true,
    });
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      mode: "approved-repair",
      status: "waiting_manual_review",
      requested_check: "tests",
      iteration: 1,
    }));
    mocks.listAuditRepairExecutions.mockReturnValue([{
      id: "repair-exec-1",
      job_id: "audit-job-1",
      status: "started",
      iteration: 1,
      thread_id: "thread-1",
      turn_id: "turn-1",
      result_summary: "repair Codex turn started in isolated worktree",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:10.000Z",
    }]);
    const interaction = makeInteraction("repair-reviewed", "tests", {
      note: "checked E:\\codex_works\\secret-app and worker 192.168.0.205 output manually",
    });

    await execute(interaction as never);

    expect(mocks.updateAuditRepairExecutionResult).toHaveBeenCalledWith(
      "repair-exec-1",
      "reviewed",
      "operator reviewed repair execution: checked <local-path> and worker <ip> output manually",
      expect.any(String),
      "thread-1",
      "turn-1",
    );
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Audit job `audit-jo...` repair execution was marked reviewed.\nReview note: checked <local-path> and worker <ip> output manually\nNext: run `/audit recheck` to validate the isolated repair workspace.",
    });
  });

  it("rejects repair-reviewed when there is no started execution in the current iteration", async () => {
    mocks.getConfig.mockReturnValue({
      DISCORD_ENABLE_AUDIT: true,
      DISCORD_ENABLE_AUDIT_REPAIR: true,
    });
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      mode: "approved-repair",
      status: "waiting_manual_review",
      requested_check: "tests",
      iteration: 1,
    }));
    mocks.listAuditRepairExecutions.mockReturnValue([{
      id: "repair-exec-1",
      job_id: "audit-job-1",
      status: "reviewed",
      iteration: 1,
      thread_id: "thread-1",
      turn_id: "turn-1",
      result_summary: "operator marked repair execution reviewed",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:10.000Z",
    }]);
    const interaction = makeInteraction("repair-reviewed");

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Audit job `audit-jo...` has no started repair execution for iteration 1 to mark reviewed.",
    });
    expect(mocks.updateAuditRepairExecutionResult).not.toHaveBeenCalled();
  });

  it("removes a terminal job repair workspace through the safe cleanup helper", async () => {
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      status: "completed",
      requested_check: "tests",
      iteration: 2,
    }));
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "prepared",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:01.000Z",
    });
    const interaction = makeInteraction("repair-cleanup");

    await execute(interaction as never);

    expect(mocks.removeRepairWorktree).toHaveBeenCalledWith({
      sourceRoot: "/projects/app",
      jobId: "audit-job-1",
      worktreePath: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
    });
    expect(mocks.updateAuditRepairWorktreeStatus).toHaveBeenCalledWith("audit-job-1", "removed", expect.any(String));
    expect(mocks.recordOperatorEvent).toHaveBeenCalledWith({
      kind: "task",
      status: "audit-repair-cleanup",
      channelId: "channel-1",
    });
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Audit job `audit-jo...` repair workspace cleanup: removed.",
    });
  });

  it("rejects repair cleanup while the audit job is not terminal", async () => {
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      status: "waiting_manual_review",
      requested_check: "tests",
      iteration: 1,
    }));
    const interaction = makeInteraction("repair-cleanup");

    await execute(interaction as never);

    expect(mocks.removeRepairWorktree).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Audit job `audit-jo...` is not terminal; cleanup is only allowed after completed, failed, stagnated, or stopped.",
    });
  });

  it("marks cleanup_failed when safe repair workspace cleanup fails", async () => {
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      status: "stagnated",
      requested_check: "tests",
      iteration: 2,
    }));
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "retained",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:01.000Z",
    });
    mocks.removeRepairWorktree.mockRejectedValueOnce(new Error("dirty repair worktree"));
    const interaction = makeInteraction("repair-cleanup");

    await execute(interaction as never);

    expect(mocks.updateAuditRepairWorktreeStatus).toHaveBeenCalledWith("audit-job-1", "cleanup_failed", expect.any(String));
    expect(mocks.recordOperatorEvent).toHaveBeenCalledWith({
      kind: "task",
      status: "audit-repair-cleanup-failed",
      channelId: "channel-1",
    });
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Audit job `audit-jo...` repair workspace cleanup failed; workspace retained for manual review.",
    });
  });

  it("uses applied repair cleanup when the repair result was already handed off", async () => {
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      status: "completed",
      requested_check: "tests",
      iteration: 1,
    }));
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "applied",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:01.000Z",
    });
    const interaction = makeInteraction("repair-cleanup");

    await execute(interaction as never);

    expect(mocks.removeAppliedRepairWorktree).toHaveBeenCalledWith({
      sourceRoot: "/projects/app",
      jobId: "audit-job-1",
      worktreePath: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
    });
    expect(mocks.removeRepairWorktree).not.toHaveBeenCalled();
    expect(mocks.updateAuditRepairWorktreeStatus).toHaveBeenCalledWith("audit-job-1", "applied_removed", expect.any(String));
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Audit job `audit-jo...` repair workspace cleanup: removed.",
    });
  });

  it("uses reverted repair cleanup after the source handoff was reverted", async () => {
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      status: "completed",
      requested_check: "tests",
    }));
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "reverted",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:01.000Z",
    });
    const interaction = makeInteraction("repair-cleanup");

    await execute(interaction as never);

    expect(mocks.removeRevertedRepairWorktree).toHaveBeenCalledWith({
      sourceRoot: "/projects/app",
      jobId: "audit-job-1",
      worktreePath: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
    });
    expect(mocks.removeRepairWorktree).not.toHaveBeenCalled();
    expect(mocks.removeAppliedRepairWorktree).not.toHaveBeenCalled();
    expect(mocks.updateAuditRepairWorktreeStatus).toHaveBeenCalledWith("audit-job-1", "reverted_removed", expect.any(String));
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Audit job `audit-jo...` repair workspace cleanup: removed.",
    });
  });

  it("keeps repair-apply disabled behind its separate source-write flag", async () => {
    mocks.getConfig.mockReturnValue({
      DISCORD_ENABLE_AUDIT: true,
      DISCORD_ENABLE_AUDIT_REPAIR: true,
      DISCORD_ENABLE_AUDIT_REPAIR_APPLY: false,
    });
    const interaction = makeInteraction("repair-apply");

    await execute(interaction as never);

    expect(mocks.applyRepairWorktreeChanges).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "`/audit repair-apply` is disabled.\nSet `DISCORD_ENABLE_AUDIT_REPAIR_APPLY=true` only after reviewing `/audit review` and the isolated repair diff.",
    });
  });

  it("applies reviewed repair changes to the source worktree and records source validation", async () => {
    mocks.getConfig.mockReturnValue({
      DISCORD_ENABLE_AUDIT: true,
      DISCORD_ENABLE_AUDIT_REPAIR: true,
      DISCORD_ENABLE_AUDIT_REPAIR_APPLY: true,
    });
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      status: "completed",
      requested_check: "tests",
      iteration: 1,
    }));
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "cleanup_failed",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:01.000Z",
    });
    mocks.listAuditRepairExecutions.mockReturnValue([{
      id: "repair-exec-1",
      job_id: "audit-job-1",
      status: "reviewed",
      iteration: 0,
      thread_id: "thread-1",
      turn_id: "turn-1",
      result_summary: "operator reviewed repair execution",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:01.000Z",
    }]);
    mocks.listAuditSteps.mockReturnValue([
      makeStep({ status: "failed", exit_code: 1, public_output: "fail" }),
      makeStep({ id: "step-2", status: "passed", exit_code: 0, public_output: "ok" }),
    ]);
    const interaction = makeInteraction("repair-apply");

    await execute(interaction as never);

    expect(mocks.applyRepairWorktreeChanges).toHaveBeenCalledWith({
      sourceRoot: "/projects/app",
      worktreePath: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      requestedCheck: "tests",
    });
    expect(mocks.insertAuditStepResult).toHaveBeenCalledWith("audit-job-1", expect.objectContaining({
      name: "tests",
      status: "passed",
    }));
    expect(mocks.updateAuditRepairWorktreeStatus).toHaveBeenCalledWith("audit-job-1", "applied", expect.any(String));
    expect(mocks.recordOperatorEvent).toHaveBeenCalledWith({
      kind: "task",
      status: "audit-repair-applied",
      channelId: "channel-1",
    });
    const followUp = (interaction.followUp as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0].content;
    expect(followUp).toContain("**Audit repair apply completed**");
    expect(followUp).toContain("no commit, push, deploy, cleanup, or branch merge was performed");
  });

  it("rejects repair-apply without a reviewed repair execution", async () => {
    mocks.getConfig.mockReturnValue({
      DISCORD_ENABLE_AUDIT: true,
      DISCORD_ENABLE_AUDIT_REPAIR: true,
      DISCORD_ENABLE_AUDIT_REPAIR_APPLY: true,
    });
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      status: "completed",
      requested_check: "tests",
      iteration: 1,
    }));
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "prepared",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:01.000Z",
    });
    mocks.listAuditRepairExecutions.mockReturnValue([]);
    const interaction = makeInteraction("repair-apply");

    await execute(interaction as never);

    expect(mocks.applyRepairWorktreeChanges).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Audit job `audit-jo...` has no reviewed repair execution to apply.",
    });
  });

  it("reverts an applied repair handoff from the source worktree and records validation", async () => {
    mocks.getConfig.mockReturnValue({
      DISCORD_ENABLE_AUDIT: true,
      DISCORD_ENABLE_AUDIT_REPAIR: true,
      DISCORD_ENABLE_AUDIT_REPAIR_APPLY: true,
    });
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      status: "completed",
      requested_check: "tests",
      iteration: 1,
    }));
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "applied",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:01.000Z",
    });
    const interaction = makeInteraction("repair-revert");

    await execute(interaction as never);

    expect(mocks.revertAppliedRepairWorktreeChanges).toHaveBeenCalledWith({
      sourceRoot: "/projects/app",
      worktreePath: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      requestedCheck: "tests",
    });
    expect(mocks.insertAuditStepResult).toHaveBeenCalledWith("audit-job-1", expect.objectContaining({
      name: "tests",
      status: "passed",
    }));
    expect(mocks.updateAuditRepairWorktreeStatus).toHaveBeenCalledWith("audit-job-1", "reverted", expect.any(String));
    expect(mocks.recordOperatorEvent).toHaveBeenCalledWith({
      kind: "task",
      status: "audit-repair-reverted",
      channelId: "channel-1",
    });
    const followUp = (interaction.followUp as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0].content;
    expect(followUp).toContain("**Audit repair revert completed**");
    expect(followUp).toContain("no commit, push, deploy, cleanup, or branch merge was performed");
  });

  it("rejects repair-revert after the isolated applied handoff was cleaned up", async () => {
    mocks.getConfig.mockReturnValue({
      DISCORD_ENABLE_AUDIT: true,
      DISCORD_ENABLE_AUDIT_REPAIR: true,
      DISCORD_ENABLE_AUDIT_REPAIR_APPLY: true,
    });
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      status: "completed",
      requested_check: "tests",
      iteration: 1,
    }));
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "applied_removed",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:01.000Z",
    });
    const interaction = makeInteraction("repair-revert");

    await execute(interaction as never);

    expect(mocks.revertAppliedRepairWorktreeChanges).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Audit job `audit-jo...` repair handoff was already cleaned up; /audit cannot safely revert it without the isolated worktree.",
    });
  });

  it("rechecks the requested check in the isolated repair worktree", async () => {
    mocks.getLatestAuditJob
      .mockReturnValueOnce(makeJob({
        status: "waiting_manual_review",
        requested_check: "tests",
        iteration: 0,
      }))
      .mockReturnValueOnce(makeJob({
        status: "completed",
        requested_check: "tests",
        iteration: 1,
      }));
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "prepared",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    });
    mocks.listAuditSteps.mockReturnValue([makeStep({ status: "passed" })]);
    const interaction = makeInteraction("recheck");

    await execute(interaction as never);

    expect(mocks.updateAuditJobProgress).toHaveBeenCalledWith(
      "audit-job-1",
      "rechecking",
      "tests",
      1,
      expect.any(String),
    );
    expect(mocks.runAuditCheckPipeline).toHaveBeenCalledWith(
      "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      "tests",
      {
        signal: expect.any(AbortSignal),
        shouldStop: expect.any(Function),
      },
    );
    expect(mocks.insertAuditStepResult).toHaveBeenCalledWith("audit-job-1", expect.objectContaining({
      name: "tests",
      status: "passed",
    }));
    expect(mocks.updateAuditRepairWorktreeStatus).toHaveBeenCalledWith("audit-job-1", "prepared", expect.any(String));
    expect(mocks.updateAuditJobProgress).toHaveBeenLastCalledWith(
      "audit-job-1",
      "completed",
      null,
      1,
      expect.any(String),
    );
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: expect.stringContaining("**Audit recheck completed**"),
    });
    expect(interaction.followUp.mock.calls[0][0].content).not.toContain("/projects/app");
  });

  it("rejects recheck when no repair workspace exists", async () => {
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      status: "waiting_manual_review",
      requested_check: "tests",
    }));
    mocks.getAuditRepairWorktree.mockReturnValue(undefined);
    const interaction = makeInteraction("recheck");

    await execute(interaction as never);

    expect(mocks.runAuditCheckPipeline).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Audit job `audit-jo...` has no prepared repair workspace to recheck.",
    });
  });

  it("rejects recheck while a same-iteration repair execution is still only started", async () => {
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      status: "waiting_manual_review",
      requested_check: "tests",
      iteration: 1,
    }));
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "prepared",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    });
    mocks.listAuditRepairExecutions.mockReturnValue([{
      id: "repair-exec-1",
      job_id: "audit-job-1",
      status: "started",
      iteration: 1,
      thread_id: "thread-1",
      turn_id: "turn-1",
      result_summary: "repair Codex turn started in isolated worktree",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:10.000Z",
    }]);
    const interaction = makeInteraction("recheck");

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Audit job `audit-jo...` has a started repair execution for iteration 1; run /audit repair-reviewed before /audit recheck.",
    });
    expect(mocks.runAuditCheckPipeline).not.toHaveBeenCalled();
  });

  it("rejects recheck when the iteration budget is exhausted", async () => {
    mocks.getLatestAuditJob.mockReturnValue(makeJob({
      status: "waiting_manual_review",
      requested_check: "tests",
      iteration: 2,
      max_iterations: 2,
    }));
    const interaction = makeInteraction("recheck");

    await execute(interaction as never);

    expect(mocks.getAuditRepairWorktree).not.toHaveBeenCalled();
    expect(mocks.runAuditCheckPipeline).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Audit job `audit-jo...` has reached its recheck budget (2/2).",
    });
  });

  it("retains the repair workspace when recheck still fails", async () => {
    mocks.getLatestAuditJob
      .mockReturnValueOnce(makeJob({
        status: "waiting_manual_review",
        requested_check: "tests",
        iteration: 0,
      }))
      .mockReturnValueOnce(makeJob({
        status: "waiting_manual_review",
        requested_check: "tests",
        iteration: 1,
      }));
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "prepared",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    });
    mocks.runAuditCheckPipeline.mockResolvedValue([{
      name: "tests",
      status: "failed",
      exitCode: 1,
      timedOut: false,
      stopped: false,
      publicOutput: "failed",
      startedAt: "2026-08-01T12:00:00.000Z",
      finishedAt: "2026-08-01T12:00:01.000Z",
      durationMs: 1_000,
    }]);
    const interaction = makeInteraction("recheck");

    await execute(interaction as never);

    expect(mocks.updateAuditRepairWorktreeStatus).toHaveBeenCalledWith("audit-job-1", "retained", expect.any(String));
    expect(mocks.updateAuditJobProgress).toHaveBeenLastCalledWith(
      "audit-job-1",
      "waiting_manual_review",
      null,
      1,
      expect.any(String),
    );
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: expect.stringContaining("**Audit recheck waiting_manual_review**"),
    });
  });

  it("stops as stagnated when recheck repeats the same failed fingerprint", async () => {
    mocks.getLatestAuditJob
      .mockReturnValueOnce(makeJob({
        status: "waiting_manual_review",
        requested_check: "tests",
        iteration: 1,
      }))
      .mockReturnValueOnce(makeJob({
        status: "stagnated",
        requested_check: "tests",
        iteration: 2,
      }));
    mocks.getAuditRepairWorktree.mockReturnValue({
      job_id: "audit-job-1",
      worktree_path: "/projects/app/.discord-bot-state/audit-worktrees/audit-job-1",
      branch_name: "audit-repair/audit-job-1",
      head_commit: "0123456789abcdef",
      status: "retained",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    });
    mocks.listAuditSteps
      .mockReturnValueOnce([makeStep({
        status: "failed",
        exit_code: 1,
        public_output: "same failure",
      })])
      .mockReturnValueOnce([makeStep({
        status: "failed",
        exit_code: 1,
        public_output: "same failure",
      })]);
    mocks.runAuditCheckPipeline.mockResolvedValue([{
      name: "tests",
      status: "failed",
      exitCode: 1,
      timedOut: false,
      stopped: false,
      publicOutput: "same failure",
      startedAt: "2026-08-01T12:00:00.000Z",
      finishedAt: "2026-08-01T12:00:01.000Z",
      durationMs: 1_000,
    }]);
    const interaction = makeInteraction("recheck");

    await execute(interaction as never);

    expect(mocks.updateAuditRepairWorktreeStatus).toHaveBeenCalledWith("audit-job-1", "retained", expect.any(String));
    expect(mocks.updateAuditJobProgress).toHaveBeenLastCalledWith(
      "audit-job-1",
      "stagnated",
      null,
      2,
      expect.any(String),
    );
    expect(mocks.recordOperatorEvent).toHaveBeenCalledWith({
      kind: "task",
      status: "audit-stagnated",
      channelId: "channel-1",
    });
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: expect.stringContaining("**Audit recheck stagnated**"),
    });
  });
});
