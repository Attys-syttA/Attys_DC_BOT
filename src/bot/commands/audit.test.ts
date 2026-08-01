import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getProject: vi.fn(),
  getActiveAuditJob: vi.fn(),
  getActiveAuditJobByProjectPath: vi.fn(),
  getAuditJob: vi.fn(),
  getLatestAuditJob: vi.fn(),
  createAuditJob: vi.fn(),
  updateAuditJobProgress: vi.fn(),
  requestAuditJobStop: vi.fn(),
  insertAuditStepResult: vi.fn(),
  listAuditSteps: vi.fn(),
  runAuditCheckPipeline: vi.fn(),
  recordOperatorEvent: vi.fn(),
}));

vi.mock("node:crypto", () => ({
  randomUUID: () => "audit-job-1",
}));

vi.mock("../../utils/config.js", () => ({
  getConfig: mocks.getConfig,
}));

vi.mock("../../db/database.js", () => ({
  getProject: mocks.getProject,
  getActiveAuditJob: mocks.getActiveAuditJob,
  getActiveAuditJobByProjectPath: mocks.getActiveAuditJobByProjectPath,
  getAuditJob: mocks.getAuditJob,
  getLatestAuditJob: mocks.getLatestAuditJob,
  createAuditJob: mocks.createAuditJob,
  updateAuditJobProgress: mocks.updateAuditJobProgress,
  requestAuditJobStop: mocks.requestAuditJobStop,
  insertAuditStepResult: mocks.insertAuditStepResult,
  listAuditSteps: mocks.listAuditSteps,
}));

vi.mock("../../audit/check-runner.js", () => ({
  runAuditCheckPipeline: mocks.runAuditCheckPipeline,
}));

vi.mock("../operator-events.js", () => ({
  recordOperatorEvent: mocks.recordOperatorEvent,
}));

import { execute } from "./audit.js";
import type { AuditCheckName } from "../../audit/check-catalog.js";
import type { AuditCheckRunnerOptions } from "../../audit/check-runner.js";

function makeInteraction(subcommand: "start" | "status" | "stop" | "repair", check = "tests") {
  return {
    channelId: "channel-1",
    options: {
      getSubcommand: vi.fn(() => subcommand),
      getString: vi.fn(() => check),
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
    mocks.getLatestAuditJob.mockReturnValue(makeJob());
    mocks.listAuditSteps.mockReturnValue([makeStep()]);
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

  it("requests stop for an active job", async () => {
    mocks.getActiveAuditJob.mockReturnValue(makeJob({ status: "running_checks", current_step: "tests" }));
    const interaction = makeInteraction("stop");

    await execute(interaction as never);

    expect(mocks.requestAuditJobStop).toHaveBeenCalledWith("audit-job-1", expect.any(String));
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Stop requested for audit job `audit-jo...`.",
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
});
