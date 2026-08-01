import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getProject: vi.fn(),
  getActiveAuditJob: vi.fn(),
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

function makeInteraction(subcommand: "start" | "status" | "stop", check = "tests") {
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
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_AUDIT: true });
    mocks.getProject.mockReturnValue({ channel_id: "channel-1", project_path: "/projects/app" });
    mocks.getActiveAuditJob.mockReturnValue(undefined);
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
      shouldStop: expect.any(Function),
    });
    expect(mocks.insertAuditStepResult).toHaveBeenCalledWith("audit-job-1", expect.objectContaining({
      name: "tests",
      status: "passed",
    }));
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
});
