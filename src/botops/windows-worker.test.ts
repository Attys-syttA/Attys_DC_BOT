import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FixedCommandRunner } from "./windows-worker.js";

const repairApplyMocks = vi.hoisted(() => ({
  applyRepairWorktreeChanges: vi.fn(),
}));
const repairCleanupMocks = vi.hoisted(() => ({
  removeAppliedRepairWorktree: vi.fn(),
  removeRepairWorktree: vi.fn(),
  removeRevertedRepairWorktree: vi.fn(),
}));

vi.mock("better-sqlite3", async () => {
  const actual = await vi.importActual("better-sqlite3") as any;
  const RealDatabase = actual.default;
  return {
    default: function MemoryDatabase(_path: string, options?: object) {
      return new RealDatabase(":memory:", options);
    },
  };
});
vi.mock("../audit/repair-apply.js", () => ({
  applyRepairWorktreeChanges: repairApplyMocks.applyRepairWorktreeChanges,
}));
vi.mock("../audit/worktree-manager.js", () => ({
  removeAppliedRepairWorktree: repairCleanupMocks.removeAppliedRepairWorktree,
  removeRepairWorktree: repairCleanupMocks.removeRepairWorktree,
  removeRevertedRepairWorktree: repairCleanupMocks.removeRevertedRepairWorktree,
}));

import {
  approveBotOpsJob,
  createAuditJob,
  createAuditRepairExecution,
  createAuditRepairWorktree,
  createOrGetBotOpsJob,
  getBotOpsJob,
  initDatabase,
  insertAuditStepResult,
  listBotOpsWorkerHeartbeats,
  registerProject,
  getAuditRepairWorktree,
  listAuditSteps,
} from "../db/database.js";
import { defaultAuditCapabilities } from "../audit/types.js";
import {
  buildWindowsWorkerStatusSnapshot,
  formatWindowsWorkerStatus,
  recordWindowsWorkerStatus,
  readBotLockState,
  readWorkerConfigState,
  resolveWindowsWorkerRepoRoot,
  runWindowsWorkerOnce,
} from "./windows-worker.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attys-windows-worker-test-"));
  tempDirs.push(dir);
  return dir;
}

function makeRunner(gitStatusOutput: string, npmCode = 0, cmdCode = 0): FixedCommandRunner {
  return (command, args) => {
    if (command === "git" && args.join(" ") === "status --porcelain") {
      return { code: 0, output: gitStatusOutput };
    }
    if (command === "git" && args.join(" ") === "rev-parse --abbrev-ref --symbolic-full-name @{u}") {
      return { code: 0, output: "origin/main" };
    }
    if (command === "git" && args.join(" ") === "fetch --prune") {
      return { code: 0, output: "fetched" };
    }
    if (command === "git" && args.join(" ") === "rev-list --left-right --count HEAD...@{u}") {
      return { code: 0, output: "0\t0" };
    }
    if (command === "git" && args.join(" ") === "push") {
      return { code: 0, output: "pushed" };
    }
    if (command === "git" && args.join(" ") === "diff --check --cached") {
      return { code: 0, output: "" };
    }
    if (command === "git" && args[0] === "commit") {
      return { code: 0, output: "committed" };
    }
    if (command === "ggshield") {
      return { code: 0, output: "No secrets have been found" };
    }
    if (command === "npm" || command === "npm.cmd") {
      return { code: npmCode, output: npmCode === 0 ? "ok" : "failed" };
    }
    if (command === "cmd" && args.join(" ") === "/c win-start.bat") {
      return { code: cmdCode, output: cmdCode === 0 ? "restarted" : "failed" };
    }
    return { code: 1, output: "unexpected command" };
  };
}

describe("Windows worker", () => {
  beforeEach(() => {
    initDatabase();
    repairApplyMocks.applyRepairWorktreeChanges.mockReset();
    repairCleanupMocks.removeAppliedRepairWorktree.mockReset();
    repairCleanupMocks.removeRepairWorktree.mockReset();
    repairCleanupMocks.removeRevertedRepairWorktree.mockReset();
    repairApplyMocks.applyRepairWorktreeChanges.mockResolvedValue({
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
        startedAt: "2026-08-18T10:02:00.000Z",
        finishedAt: "2026-08-18T10:02:01.000Z",
        durationMs: 1_000,
      }],
    });
    repairCleanupMocks.removeAppliedRepairWorktree.mockResolvedValue({ removed: true, summary: "removed" });
    repairCleanupMocks.removeRepairWorktree.mockResolvedValue({ removed: true, summary: "removed" });
    repairCleanupMocks.removeRevertedRepairWorktree.mockResolvedValue({ removed: true, summary: "removed" });
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  it("reports idle when there is no Windows job", async () => {
    const repo = makeTempDir();
    const result = await runWindowsWorkerOnce(repo, "worker-1", makeRunner(""));

    expect(result.status).toBe("idle");
    expect(result.result).toBe("no requested Windows worker job");
    expect(listBotOpsWorkerHeartbeats("windows")[0]).toMatchObject({
      worker_id: "worker-1",
      status: "idle",
      detail: "no requested Windows worker job",
    });
  });

  it("completes a Windows status job without requiring a clean worktree", async () => {
    const repo = makeTempDir();
    createOrGetBotOpsJob({
      job_id: "windows-status-1",
      requested_by: "operator",
      target: "windows",
      capability: "status.read",
      summary: "windows status",
    });

    const result = await runWindowsWorkerOnce(
      repo,
      "worker-1",
      makeRunner(" M src/file.ts"),
      new Date("2026-08-18T10:01:00.000Z"),
    );

    expect(result.status).toBe("completed");
    expect(result.result).toContain("Windows worker status completed");
    expect(result.result).toContain("worktree: dirty");
    expect(getBotOpsJob("windows-status-1")?.status).toBe("Completed");
  });

  it("blocks check jobs on a dirty worktree", async () => {
    const repo = makeTempDir();
    createOrGetBotOpsJob({
      job_id: "windows-check-1",
      requested_by: "operator",
      target: "windows",
      capability: "audit.check",
      summary: "check",
    });

    const result = await runWindowsWorkerOnce(
      repo,
      "worker-1",
      makeRunner(" M src/file.ts"),
      new Date("2026-08-18T10:01:00.000Z"),
    );

    expect(result.status).toBe("failed");
    expect(result.result).toBe("check helper blocked: worktree dirty");
    expect(getBotOpsJob("windows-check-1")?.status).toBe("Failed");
  });

  it("runs only the fixed npm check helper for clean check jobs", async () => {
    const repo = makeTempDir();
    fs.writeFileSync(path.join(repo, ".env"), "BASE_PROJECT_DIR=C:\\workspace\n");
    const calls: string[] = [];
    const runner: FixedCommandRunner = (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (command === "git") return { code: 0, output: "" };
      if (command === "npm" || command === "npm.cmd") return { code: 0, output: "ok" };
      return { code: 1, output: "unexpected" };
    };
    createOrGetBotOpsJob({
      job_id: "windows-check-2",
      requested_by: "operator",
      target: "windows",
      capability: "audit.check",
      summary: "check",
    });

    const result = await runWindowsWorkerOnce(repo, "worker-1", runner);

    expect(result.status).toBe("completed");
    expect(result.result).toBe("check helper completed: npm run check passed");
    expect(calls).toContain("git status --porcelain");
    expect(calls.some((call) => call.endsWith("run check"))).toBe(true);
  });

  it("applies reviewed repair handoff only after BotOps approval", async () => {
    const repo = makeTempDir();
    registerProject("channel-1", repo, "guild-1");
    createAuditJob({
      id: "audit-job-1",
      channelId: "channel-1",
      projectLabel: "app",
      mode: "check-only",
      status: "completed",
      requestedCheck: "tests",
      currentStep: "recheck",
      iteration: 1,
      maxIterations: 2,
      stopRequested: false,
      capabilities: defaultAuditCapabilities("check-only"),
      createdAt: "2026-08-18T10:00:00.000Z",
      updatedAt: "2026-08-18T10:00:01.000Z",
    });
    createAuditRepairWorktree({
      jobId: "audit-job-1",
      worktreePath: path.join(repo, ".discord-bot-state", "audit-worktrees", "audit-job-1"),
      branchName: "audit-repair/audit-job-1",
      headCommit: "0123456789abcdef",
      status: "cleanup_failed",
      createdAt: "2026-08-18T10:00:00.000Z",
      updatedAt: "2026-08-18T10:00:01.000Z",
    });
    createAuditRepairExecution({
      id: "repair-execution-1",
      jobId: "audit-job-1",
      status: "reviewed",
      iteration: 1,
      threadId: "thread-1",
      turnId: "turn-1",
      resultSummary: "operator reviewed",
      createdAt: "2026-08-18T10:00:00.000Z",
      updatedAt: "2026-08-18T10:00:01.000Z",
    });
    insertAuditStepResult("audit-job-1", {
      name: "tests",
      status: "passed",
      exitCode: 0,
      timedOut: false,
      stopped: false,
      publicOutput: "ok",
      startedAt: "2026-08-18T10:00:02.000Z",
      finishedAt: "2026-08-18T10:00:03.000Z",
      durationMs: 1_000,
    });
    createOrGetBotOpsJob({
      job_id: "audit-repair-apply:audit-job-1",
      requested_by: "operator",
      target: "windows",
      capability: "audit.repair.apply",
      summary: "Audit repair apply handoff for job audit-jo",
      payload_json: JSON.stringify({
        channel_id: "channel-1",
        audit_job_id: "audit-job-1",
      }),
    });
    expect((await runWindowsWorkerOnce(repo, "worker-1", makeRunner(""))).status).toBe("idle");
    approveBotOpsJob("audit-repair-apply:audit-job-1", "operator", new Date("2026-08-18T10:01:00.000Z"));

    const result = await runWindowsWorkerOnce(repo, "worker-1", makeRunner(""), new Date("2026-08-18T10:01:01.000Z"));

    expect(result.status).toBe("completed");
    expect(result.result).toBe("audit repair apply completed: applied files=1");
    expect(repairApplyMocks.applyRepairWorktreeChanges).toHaveBeenCalledWith({
      sourceRoot: repo,
      worktreePath: path.join(repo, ".discord-bot-state", "audit-worktrees", "audit-job-1"),
      requestedCheck: "tests",
    });
    expect(getAuditRepairWorktree("audit-job-1")?.status).toBe("applied");
    expect(listAuditSteps("audit-job-1").at(-1)).toMatchObject({
      step_name: "tests",
      status: "passed",
      public_output: "ok",
    });
    expect(getBotOpsJob("audit-repair-apply:audit-job-1")?.status).toBe("Completed");
  });

  it("moves repair apply validation failures to manual review", async () => {
    const repo = makeTempDir();
    repairApplyMocks.applyRepairWorktreeChanges.mockResolvedValueOnce({
      changedFiles: 1,
      summary: "applied files=1 validation failed",
      validationPassed: false,
      validationResults: [{
        name: "tests",
        status: "failed",
        exitCode: 1,
        timedOut: false,
        stopped: false,
        publicOutput: "failed",
        startedAt: "2026-08-18T10:02:00.000Z",
        finishedAt: "2026-08-18T10:02:01.000Z",
        durationMs: 1_000,
      }],
    });
    registerProject("channel-1", repo, "guild-1");
    createAuditJob({
      id: "audit-job-2",
      channelId: "channel-1",
      projectLabel: "app",
      mode: "check-only",
      status: "completed",
      requestedCheck: "tests",
      currentStep: "recheck",
      iteration: 1,
      maxIterations: 2,
      stopRequested: false,
      capabilities: defaultAuditCapabilities("check-only"),
      createdAt: "2026-08-18T10:00:00.000Z",
      updatedAt: "2026-08-18T10:00:01.000Z",
    });
    createAuditRepairWorktree({
      jobId: "audit-job-2",
      worktreePath: path.join(repo, ".discord-bot-state", "audit-worktrees", "audit-job-2"),
      branchName: "audit-repair/audit-job-2",
      headCommit: "0123456789abcdef",
      status: "cleanup_failed",
      createdAt: "2026-08-18T10:00:00.000Z",
      updatedAt: "2026-08-18T10:00:01.000Z",
    });
    createAuditRepairExecution({
      id: "repair-execution-2",
      jobId: "audit-job-2",
      status: "reviewed",
      iteration: 1,
      threadId: "thread-1",
      turnId: "turn-1",
      resultSummary: "operator reviewed",
      createdAt: "2026-08-18T10:00:00.000Z",
      updatedAt: "2026-08-18T10:00:01.000Z",
    });
    insertAuditStepResult("audit-job-2", {
      name: "tests",
      status: "passed",
      exitCode: 0,
      timedOut: false,
      stopped: false,
      publicOutput: "ok",
      startedAt: "2026-08-18T10:00:02.000Z",
      finishedAt: "2026-08-18T10:00:03.000Z",
      durationMs: 1_000,
    });
    createOrGetBotOpsJob({
      job_id: "audit-repair-apply:audit-job-2",
      requested_by: "operator",
      target: "windows",
      capability: "audit.repair.apply",
      summary: "Audit repair apply handoff for job audit-jo",
      payload_json: JSON.stringify({
        channel_id: "channel-1",
        audit_job_id: "audit-job-2",
      }),
    });
    approveBotOpsJob("audit-repair-apply:audit-job-2", "operator", new Date("2026-08-18T10:01:00.000Z"));

    const result = await runWindowsWorkerOnce(repo, "worker-1", makeRunner(""), new Date("2026-08-18T10:01:01.000Z"));

    expect(result.status).toBe("failed");
    expect(result.result).toBe("audit repair apply validation failed: applied files=1 validation failed");
    expect(getBotOpsJob("audit-repair-apply:audit-job-2")?.status).toBe("WaitingManualReview");
  });

  it("cleans up a guarded repair worktree only after BotOps approval", async () => {
    const repo = makeTempDir();
    registerProject("channel-1", repo, "guild-1");
    createAuditJob({
      id: "audit-job-cleanup-1",
      channelId: "channel-1",
      projectLabel: "app",
      mode: "check-only",
      status: "completed",
      requestedCheck: "tests",
      currentStep: null,
      iteration: 1,
      maxIterations: 2,
      stopRequested: false,
      capabilities: defaultAuditCapabilities("check-only"),
      createdAt: "2026-08-18T10:00:00.000Z",
      updatedAt: "2026-08-18T10:00:01.000Z",
    });
    createAuditRepairWorktree({
      jobId: "audit-job-cleanup-1",
      worktreePath: path.join(repo, ".discord-bot-state", "audit-worktrees", "audit-job-cleanup-1"),
      branchName: "audit-repair/audit-job-cleanup-1",
      headCommit: "0123456789abcdef",
      status: "retained",
      createdAt: "2026-08-18T10:00:00.000Z",
      updatedAt: "2026-08-18T10:00:01.000Z",
    });
    createOrGetBotOpsJob({
      job_id: "audit-repair-cleanup:audit-job-cleanup-1",
      requested_by: "operator",
      target: "windows",
      capability: "repair.cleanup",
      summary: "Audit repair cleanup handoff for job audit-jo",
      payload_json: JSON.stringify({
        channel_id: "channel-1",
        audit_job_id: "audit-job-cleanup-1",
      }),
    });
    expect((await runWindowsWorkerOnce(repo, "worker-1", makeRunner(""))).status).toBe("idle");
    approveBotOpsJob("audit-repair-cleanup:audit-job-cleanup-1", "operator", new Date("2026-08-18T10:01:00.000Z"));

    const result = await runWindowsWorkerOnce(repo, "worker-1", makeRunner(""), new Date("2026-08-18T10:01:01.000Z"));

    expect(result.status).toBe("completed");
    expect(result.result).toBe("repair cleanup completed: removed");
    expect(repairCleanupMocks.removeRepairWorktree).toHaveBeenCalledWith({
      sourceRoot: repo,
      jobId: "audit-job-cleanup-1",
      worktreePath: path.join(repo, ".discord-bot-state", "audit-worktrees", "audit-job-cleanup-1"),
    });
    expect(getAuditRepairWorktree("audit-job-cleanup-1")?.status).toBe("removed");
    expect(getBotOpsJob("audit-repair-cleanup:audit-job-cleanup-1")?.status).toBe("Completed");
  });

  it("uses applied repair cleanup helper for applied repair worktrees", async () => {
    const repo = makeTempDir();
    registerProject("channel-1", repo, "guild-1");
    createAuditJob({
      id: "audit-job-cleanup-2",
      channelId: "channel-1",
      projectLabel: "app",
      mode: "check-only",
      status: "completed",
      requestedCheck: "tests",
      currentStep: null,
      iteration: 1,
      maxIterations: 2,
      stopRequested: false,
      capabilities: defaultAuditCapabilities("check-only"),
      createdAt: "2026-08-18T10:00:00.000Z",
      updatedAt: "2026-08-18T10:00:01.000Z",
    });
    createAuditRepairWorktree({
      jobId: "audit-job-cleanup-2",
      worktreePath: path.join(repo, ".discord-bot-state", "audit-worktrees", "audit-job-cleanup-2"),
      branchName: "audit-repair/audit-job-cleanup-2",
      headCommit: "0123456789abcdef",
      status: "applied",
      createdAt: "2026-08-18T10:00:00.000Z",
      updatedAt: "2026-08-18T10:00:01.000Z",
    });
    createOrGetBotOpsJob({
      job_id: "audit-repair-cleanup:audit-job-cleanup-2",
      requested_by: "operator",
      target: "windows",
      capability: "repair.cleanup",
      summary: "cleanup",
      payload_json: JSON.stringify({
        channel_id: "channel-1",
        audit_job_id: "audit-job-cleanup-2",
      }),
    });
    approveBotOpsJob("audit-repair-cleanup:audit-job-cleanup-2", "operator", new Date("2026-08-18T10:01:00.000Z"));

    const result = await runWindowsWorkerOnce(repo, "worker-1", makeRunner(""), new Date("2026-08-18T10:01:01.000Z"));

    expect(result.status).toBe("completed");
    expect(repairCleanupMocks.removeAppliedRepairWorktree).toHaveBeenCalledWith({
      sourceRoot: repo,
      jobId: "audit-job-cleanup-2",
      worktreePath: path.join(repo, ".discord-bot-state", "audit-worktrees", "audit-job-cleanup-2"),
    });
    expect(repairCleanupMocks.removeRepairWorktree).not.toHaveBeenCalled();
    expect(getAuditRepairWorktree("audit-job-cleanup-2")?.status).toBe("applied_removed");
  });

  it("moves cleanup helper failures to manual review and retains the repair worktree", async () => {
    const repo = makeTempDir();
    repairCleanupMocks.removeRepairWorktree.mockRejectedValueOnce(new Error("dirty repair worktree"));
    registerProject("channel-1", repo, "guild-1");
    createAuditJob({
      id: "audit-job-cleanup-3",
      channelId: "channel-1",
      projectLabel: "app",
      mode: "check-only",
      status: "stagnated",
      requestedCheck: "tests",
      currentStep: null,
      iteration: 1,
      maxIterations: 2,
      stopRequested: false,
      capabilities: defaultAuditCapabilities("check-only"),
      createdAt: "2026-08-18T10:00:00.000Z",
      updatedAt: "2026-08-18T10:00:01.000Z",
    });
    createAuditRepairWorktree({
      jobId: "audit-job-cleanup-3",
      worktreePath: path.join(repo, ".discord-bot-state", "audit-worktrees", "audit-job-cleanup-3"),
      branchName: "audit-repair/audit-job-cleanup-3",
      headCommit: "0123456789abcdef",
      status: "cleanup_failed",
      createdAt: "2026-08-18T10:00:00.000Z",
      updatedAt: "2026-08-18T10:00:01.000Z",
    });
    createOrGetBotOpsJob({
      job_id: "audit-repair-cleanup:audit-job-cleanup-3",
      requested_by: "operator",
      target: "windows",
      capability: "repair.cleanup",
      summary: "cleanup",
      payload_json: JSON.stringify({
        channel_id: "channel-1",
        audit_job_id: "audit-job-cleanup-3",
      }),
    });
    approveBotOpsJob("audit-repair-cleanup:audit-job-cleanup-3", "operator", new Date("2026-08-18T10:01:00.000Z"));

    const result = await runWindowsWorkerOnce(repo, "worker-1", makeRunner(""), new Date("2026-08-18T10:01:01.000Z"));

    expect(result.status).toBe("failed");
    expect(result.result).toBe("repair cleanup blocked: dirty repair worktree");
    expect(getAuditRepairWorktree("audit-job-cleanup-3")?.status).toBe("cleanup_failed");
    expect(getBotOpsJob("audit-repair-cleanup:audit-job-cleanup-3")?.status).toBe("WaitingManualReview");
  });

  it("does not pick service restart jobs without approval", async () => {
    const repo = makeTempDir();
    createOrGetBotOpsJob({
      job_id: "restart-1",
      requested_by: "operator",
      target: "windows",
      capability: "service.restart",
      summary: "restart",
    });

    expect((await runWindowsWorkerOnce(repo, "worker-1", makeRunner(""))).status).toBe("idle");
    expect(getBotOpsJob("restart-1")?.status).toBe("WaitingApproval");
  });

  it("does not pick git push jobs without approval", async () => {
    const repo = makeTempDir();
    createOrGetBotOpsJob({
      job_id: "push-1",
      requested_by: "operator",
      target: "windows",
      capability: "git.push",
      summary: "push",
    });

    expect((await runWindowsWorkerOnce(repo, "worker-1", makeRunner(""))).status).toBe("idle");
    expect(getBotOpsJob("push-1")?.status).toBe("WaitingApproval");
  });

  it("does not pick git commit jobs without approval", async () => {
    const repo = makeTempDir();
    createOrGetBotOpsJob({
      job_id: "commit-1",
      requested_by: "operator",
      target: "windows",
      capability: "git.commit",
      summary: "commit",
      payload_json: JSON.stringify({ message: "feat: staged change" }),
    });

    expect((await runWindowsWorkerOnce(repo, "worker-1", makeRunner("M  src/file.ts"))).status).toBe("idle");
    expect(getBotOpsJob("commit-1")?.status).toBe("WaitingApproval");
  });

  it("blocks approved git commit jobs without a valid message payload", async () => {
    const repo = makeTempDir();
    createOrGetBotOpsJob({
      job_id: "commit-no-message",
      requested_by: "operator",
      target: "windows",
      capability: "git.commit",
      summary: "commit",
    });
    approveBotOpsJob("commit-no-message", "operator", new Date("2026-08-18T10:00:00.000Z"));

    const result = await runWindowsWorkerOnce(repo, "worker-1", makeRunner("M  src/file.ts"), new Date("2026-08-18T10:01:00.000Z"));

    expect(result.status).toBe("failed");
    expect(result.result).toBe("git commit blocked: valid commit message missing");
    expect(getBotOpsJob("commit-no-message")?.status).toBe("Failed");
  });

  it("blocks approved git commit jobs without staged changes", async () => {
    const repo = makeTempDir();
    createOrGetBotOpsJob({
      job_id: "commit-empty",
      requested_by: "operator",
      target: "windows",
      capability: "git.commit",
      summary: "commit",
      payload_json: JSON.stringify({ message: "feat: staged change" }),
    });
    approveBotOpsJob("commit-empty", "operator", new Date("2026-08-18T10:00:00.000Z"));

    const result = await runWindowsWorkerOnce(repo, "worker-1", makeRunner(""), new Date("2026-08-18T10:01:00.000Z"));

    expect(result.status).toBe("failed");
    expect(result.result).toBe("git commit blocked: no staged changes");
    expect(getBotOpsJob("commit-empty")?.status).toBe("Failed");
  });

  it("blocks approved git commit jobs with unstaged or untracked changes", async () => {
    const repo = makeTempDir();
    createOrGetBotOpsJob({
      job_id: "commit-dirty",
      requested_by: "operator",
      target: "windows",
      capability: "git.commit",
      summary: "commit",
      payload_json: JSON.stringify({ message: "feat: staged change" }),
    });
    approveBotOpsJob("commit-dirty", "operator", new Date("2026-08-18T10:00:00.000Z"));

    const result = await runWindowsWorkerOnce(
      repo,
      "worker-1",
      makeRunner("M  src/file.ts\n M src/other.ts\n?? tmp.txt"),
      new Date("2026-08-18T10:01:00.000Z"),
    );

    expect(result.status).toBe("failed");
    expect(result.result).toBe("git commit blocked: unstaged=1 untracked=1");
    expect(getBotOpsJob("commit-dirty")?.status).toBe("Failed");
  });

  it("blocks approved git commit jobs when staged diff check fails", async () => {
    const repo = makeTempDir();
    const runner: FixedCommandRunner = (command, args) => {
      if (command === "git" && args.join(" ") === "status --porcelain") return { code: 0, output: "M  src/file.ts" };
      if (command === "git" && args.join(" ") === "diff --check --cached") return { code: 1, output: "whitespace" };
      return { code: 1, output: "unexpected" };
    };
    createOrGetBotOpsJob({
      job_id: "commit-whitespace",
      requested_by: "operator",
      target: "windows",
      capability: "git.commit",
      summary: "commit",
      payload_json: JSON.stringify({ message: "feat: staged change" }),
    });
    approveBotOpsJob("commit-whitespace", "operator", new Date("2026-08-18T10:00:00.000Z"));

    const result = await runWindowsWorkerOnce(repo, "worker-1", runner, new Date("2026-08-18T10:01:00.000Z"));

    expect(result.status).toBe("failed");
    expect(result.result).toBe("git commit blocked: staged diff check failed");
    expect(getBotOpsJob("commit-whitespace")?.status).toBe("Failed");
  });

  it("blocks approved git commit jobs when the secret scan fails", async () => {
    const repo = makeTempDir();
    const runner: FixedCommandRunner = (command, args) => {
      if (command === "git" && args.join(" ") === "status --porcelain") return { code: 0, output: "M  src/file.ts" };
      if (command === "git" && args.join(" ") === "diff --check --cached") return { code: 0, output: "" };
      if (command === "ggshield") return { code: 1, output: "secret found" };
      return { code: 1, output: "unexpected" };
    };
    createOrGetBotOpsJob({
      job_id: "commit-secret",
      requested_by: "operator",
      target: "windows",
      capability: "git.commit",
      summary: "commit",
      payload_json: JSON.stringify({ message: "feat: staged change" }),
    });
    approveBotOpsJob("commit-secret", "operator", new Date("2026-08-18T10:00:00.000Z"));

    const result = await runWindowsWorkerOnce(repo, "worker-1", runner, new Date("2026-08-18T10:01:00.000Z"));

    expect(result.status).toBe("failed");
    expect(result.result).toBe("git commit blocked: secret scan failed");
    expect(getBotOpsJob("commit-secret")?.status).toBe("Failed");
  });

  it("runs only fixed git commit commands after exact approval", async () => {
    const repo = makeTempDir();
    const calls: string[] = [];
    const runner: FixedCommandRunner = (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (command === "git" && args.join(" ") === "status --porcelain") return { code: 0, output: "M  src/file.ts" };
      if (command === "git" && args.join(" ") === "diff --check --cached") return { code: 0, output: "" };
      if (command === "git" && args.join(" ") === "commit -m feat: staged change") return { code: 0, output: "committed" };
      if (command === "ggshield") return { code: 0, output: "No secrets have been found" };
      return { code: 1, output: "unexpected" };
    };
    createOrGetBotOpsJob({
      job_id: "commit-approved",
      requested_by: "operator",
      target: "windows",
      capability: "git.commit",
      summary: "commit",
      payload_json: JSON.stringify({ message: "feat: staged change" }),
    });
    approveBotOpsJob("commit-approved", "operator", new Date("2026-08-18T10:00:00.000Z"));

    const result = await runWindowsWorkerOnce(repo, "worker-1", runner, new Date("2026-08-18T10:01:00.000Z"));

    expect(result.status).toBe("completed");
    expect(result.result).toBe("git commit helper completed: staged changes committed");
    expect(calls).toEqual([
      "git status --porcelain",
      "git diff --check --cached",
      "ggshield secret scan path --recursive --yes --use-gitignore .",
      "git commit -m feat: staged change",
      "git status --porcelain",
    ]);
    expect(getBotOpsJob("commit-approved")?.status).toBe("Completed");
  });

  it("blocks approved git push jobs on a dirty worktree", async () => {
    const repo = makeTempDir();
    createOrGetBotOpsJob({
      job_id: "push-dirty",
      requested_by: "operator",
      target: "windows",
      capability: "git.push",
      summary: "push",
    });
    approveBotOpsJob("push-dirty", "operator", new Date("2026-08-18T10:00:00.000Z"));

    const result = await runWindowsWorkerOnce(
      repo,
      "worker-1",
      makeRunner(" M src/file.ts"),
      new Date("2026-08-18T10:01:00.000Z"),
    );

    expect(result.status).toBe("failed");
    expect(result.result).toBe("git push blocked: worktree dirty");
    expect(getBotOpsJob("push-dirty")?.status).toBe("Failed");
  });

  it("blocks approved git push jobs when the upstream is behind", async () => {
    const repo = makeTempDir();
    const runner: FixedCommandRunner = (command, args) => {
      if (command === "git" && args.join(" ") === "status --porcelain") return { code: 0, output: "" };
      if (command === "git" && args.join(" ") === "rev-parse --abbrev-ref --symbolic-full-name @{u}") {
        return { code: 0, output: "origin/main" };
      }
      if (command === "git" && args.join(" ") === "fetch --prune") return { code: 0, output: "fetched" };
      if (command === "git" && args.join(" ") === "rev-list --left-right --count HEAD...@{u}") {
        return { code: 0, output: "0\t1" };
      }
      return { code: 1, output: "unexpected" };
    };
    createOrGetBotOpsJob({
      job_id: "push-behind",
      requested_by: "operator",
      target: "windows",
      capability: "git.push",
      summary: "push",
    });
    approveBotOpsJob("push-behind", "operator", new Date("2026-08-18T10:00:00.000Z"));

    const result = await runWindowsWorkerOnce(repo, "worker-1", runner, new Date("2026-08-18T10:01:00.000Z"));

    expect(result.status).toBe("failed");
    expect(result.result).toBe("git push blocked: upstream behind=1");
    expect(getBotOpsJob("push-behind")?.status).toBe("Failed");
  });

  it("blocks approved git push jobs when fetch fails", async () => {
    const repo = makeTempDir();
    const runner: FixedCommandRunner = (command, args) => {
      if (command === "git" && args.join(" ") === "status --porcelain") return { code: 0, output: "" };
      if (command === "git" && args.join(" ") === "rev-parse --abbrev-ref --symbolic-full-name @{u}") {
        return { code: 0, output: "origin/main" };
      }
      if (command === "git" && args.join(" ") === "fetch --prune") return { code: 1, output: "network failed" };
      return { code: 1, output: "unexpected" };
    };
    createOrGetBotOpsJob({
      job_id: "push-fetch-failed",
      requested_by: "operator",
      target: "windows",
      capability: "git.push",
      summary: "push",
    });
    approveBotOpsJob("push-fetch-failed", "operator", new Date("2026-08-18T10:00:00.000Z"));

    const result = await runWindowsWorkerOnce(repo, "worker-1", runner, new Date("2026-08-18T10:01:00.000Z"));

    expect(result.status).toBe("failed");
    expect(result.result).toBe("git push blocked: fetch failed");
    expect(getBotOpsJob("push-fetch-failed")?.status).toBe("Failed");
  });

  it("runs only fixed git push commands after exact approval", async () => {
    const repo = makeTempDir();
    const calls: string[] = [];
    const runner: FixedCommandRunner = (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (command === "git" && args.join(" ") === "status --porcelain") return { code: 0, output: "" };
      if (command === "git" && args.join(" ") === "rev-parse --abbrev-ref --symbolic-full-name @{u}") {
        return { code: 0, output: "origin/main" };
      }
      if (command === "git" && args.join(" ") === "fetch --prune") {
        return { code: 0, output: "fetched" };
      }
      if (command === "git" && args.join(" ") === "rev-list --left-right --count HEAD...@{u}") {
        return { code: 0, output: "2\t0" };
      }
      if (command === "git" && args.join(" ") === "push") return { code: 0, output: "pushed" };
      return { code: 1, output: "unexpected" };
    };
    createOrGetBotOpsJob({
      job_id: "push-approved",
      requested_by: "operator",
      target: "windows",
      capability: "git.push",
      summary: "push",
    });
    approveBotOpsJob("push-approved", "operator", new Date("2026-08-18T10:00:00.000Z"));

    const result = await runWindowsWorkerOnce(repo, "worker-1", runner, new Date("2026-08-18T10:01:00.000Z"));

    expect(result.status).toBe("completed");
    expect(result.result).toBe("git push helper completed: pushed 2 commit(s)");
    expect(calls).toEqual([
      "git status --porcelain",
      "git rev-parse --abbrev-ref --symbolic-full-name @{u}",
      "git fetch --prune",
      "git rev-list --left-right --count HEAD...@{u}",
      "git push",
      "git status --porcelain",
    ]);
    expect(getBotOpsJob("push-approved")?.status).toBe("Completed");
  });

  it("blocks approved service restart jobs on a dirty worktree", async () => {
    const repo = makeTempDir();
    fs.writeFileSync(path.join(repo, ".env"), "BASE_PROJECT_DIR=C:\\workspace\n");
    fs.writeFileSync(path.join(repo, "win-start.bat"), "@echo off\n");
    createOrGetBotOpsJob({
      job_id: "restart-dirty",
      requested_by: "operator",
      target: "windows",
      capability: "service.restart",
      summary: "restart",
    });
    approveBotOpsJob("restart-dirty", "operator", new Date("2026-08-18T10:00:00.000Z"));

    const result = await runWindowsWorkerOnce(
      repo,
      "worker-1",
      makeRunner(" M src/file.ts"),
      new Date("2026-08-18T10:01:00.000Z"),
    );

    expect(result.status).toBe("failed");
    expect(result.result).toBe("service restart blocked: worktree dirty");
    expect(getBotOpsJob("restart-dirty")?.status).toBe("Failed");
  });

  it("runs only the fixed win-start restart helper and post-restart doctor after exact approval", async () => {
    const repo = makeTempDir();
    fs.writeFileSync(path.join(repo, ".env"), "BASE_PROJECT_DIR=C:\\workspace\n");
    fs.writeFileSync(path.join(repo, "win-start.bat"), "@echo off\n");
    const calls: string[] = [];
    const runner: FixedCommandRunner = (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (command === "git") return { code: 0, output: "" };
      if (command === "cmd" && args.join(" ") === "/c win-start.bat") {
        return { code: 0, output: "restarted" };
      }
      if ((command === "npm" || command === "npm.cmd") && args.join(" ") === "run doctor:local") {
        return { code: 0, output: "doctor passed" };
      }
      return { code: 1, output: "unexpected" };
    };
    createOrGetBotOpsJob({
      job_id: "restart-approved",
      requested_by: "operator",
      target: "windows",
      capability: "service.restart",
      summary: "restart",
    });
    approveBotOpsJob("restart-approved", "operator", new Date("2026-08-18T10:00:00.000Z"));

    const result = await runWindowsWorkerOnce(repo, "worker-1", runner, new Date("2026-08-18T10:01:00.000Z"));

    expect(result.status).toBe("completed");
    expect(result.result).toBe("service restart helper completed: win-start.bat and doctor passed");
    expect(calls).toContain("git status --porcelain");
    expect(calls).toContain("cmd /c win-start.bat");
    expect(calls.some((call) => call.endsWith("run doctor:local"))).toBe(true);
    expect(calls.some((call) => call.includes("powershell"))).toBe(false);
    expect(getBotOpsJob("restart-approved")?.status).toBe("Completed");
  });

  it("fails service restart when the post-restart doctor fails", async () => {
    const repo = makeTempDir();
    fs.writeFileSync(path.join(repo, ".env"), "BASE_PROJECT_DIR=C:\\workspace\n");
    fs.writeFileSync(path.join(repo, "win-start.bat"), "@echo off\n");
    const calls: string[] = [];
    const runner: FixedCommandRunner = (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (command === "git") return { code: 0, output: "" };
      if (command === "cmd" && args.join(" ") === "/c win-start.bat") {
        return { code: 0, output: "restarted" };
      }
      if ((command === "npm" || command === "npm.cmd") && args.join(" ") === "run doctor:local") {
        return { code: 1, output: "doctor failed" };
      }
      return { code: 1, output: "unexpected" };
    };
    createOrGetBotOpsJob({
      job_id: "restart-doctor-failed",
      requested_by: "operator",
      target: "windows",
      capability: "service.restart",
      summary: "restart",
    });
    approveBotOpsJob("restart-doctor-failed", "operator", new Date("2026-08-18T10:00:00.000Z"));

    const result = await runWindowsWorkerOnce(repo, "worker-1", runner, new Date("2026-08-18T10:01:00.000Z"));

    expect(result.status).toBe("failed");
    expect(result.result).toBe("service restart helper failed: post-restart doctor failed");
    expect(calls).toContain("cmd /c win-start.bat");
    expect(calls.some((call) => call.endsWith("run doctor:local"))).toBe(true);
    expect(getBotOpsJob("restart-doctor-failed")?.status).toBe("Failed");
  });

  it("requires real worker config instead of treating the database path as bot config", async () => {
    const repo = makeTempDir();
    const originalDatabasePath = process.env.DISCORD_DATABASE_PATH;
    process.env.DISCORD_DATABASE_PATH = path.join(repo, ".discord-bot-state", "bridge.sqlite");

    try {
      expect(readWorkerConfigState(repo)).toBe("missing");
    } finally {
      if (originalDatabasePath === undefined) {
        delete process.env.DISCORD_DATABASE_PATH;
      } else {
        process.env.DISCORD_DATABASE_PATH = originalDatabasePath;
      }
    }
  });

  it("resolves an explicit absolute Windows worker target repo", async () => {
    const repo = makeTempDir();

    expect(resolveWindowsWorkerRepoRoot(process.cwd(), repo)).toBe(path.resolve(repo));
  });

  it("fails closed for relative or missing Windows worker target repos", async () => {
    const repo = makeTempDir();

    expect(() => resolveWindowsWorkerRepoRoot(repo, "relative-target")).toThrow(
      "BOTOPS_WINDOWS_TARGET_REPO_ROOT must be an absolute path",
    );
    expect(() => resolveWindowsWorkerRepoRoot(repo, path.join(repo, "missing"))).toThrow(
      "BOTOPS_WINDOWS_TARGET_REPO_ROOT must point to an existing directory",
    );
  });

  it("reports stale bot locks without stopping any process", async () => {
    const repo = makeTempDir();
    fs.writeFileSync(path.join(repo, ".bot.lock"), "999999999");

    expect(readBotLockState(repo)).toBe("stale");
  });

  it("formats public-safe worker status", async () => {
    const repo = makeTempDir();
    const formatted = formatWindowsWorkerStatus(
      buildWindowsWorkerStatusSnapshot(repo, "worker-1", makeRunner("")),
    );

    expect(formatted).toContain("worker: worker-1");
    expect(formatted).toContain("capabilities: status.read, audit.check, audit.repair.apply, repair.cleanup, git.commit, git.push, service.restart");
    expect(formatted).toContain("worktree: clean");
    expect(formatted).not.toContain(":\\");
  });

  it("records public-safe status heartbeats", async () => {
    const repo = makeTempDir();
    const snapshot = buildWindowsWorkerStatusSnapshot(repo, "worker-1", makeRunner(" M src/file.ts"));
    recordWindowsWorkerStatus(snapshot, "status", "manual status check", new Date("2026-08-18T10:00:00.000Z"));

    expect(listBotOpsWorkerHeartbeats("windows")[0]).toMatchObject({
      worker_id: "worker-1",
      target: "windows",
      capabilities: "status.read, audit.check, audit.repair.apply, repair.cleanup, git.commit, git.push, service.restart",
      status: "status",
      detail: "manual status check",
      heartbeat_at: "2026-08-18T10:00:00.000Z",
    });
  });
});
