import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createAuditJob,
  createAuditRepairWorktree,
  getAuditJob,
  getAuditRepairExecution,
  getAuditRepairWorktree,
  getDb,
  initDatabase,
  insertAuditStepResult,
  listAuditSteps,
  registerProject,
  updateAuditJobProgress,
  updateAuditRepairExecutionResult,
  updateAuditRepairWorktreeStatus,
} from "../db/database.js";
import { buildAuditRepairContract } from "./repair-contract.js";
import { buildAuditRepairPrompt } from "./repair-prompt.js";
import { runAuditCheckPipeline } from "./check-runner.js";
import { startTrackedAuditRepairExecution } from "./repair-execution-tracker.js";
import {
  buildAuditJobStepContract,
  validateAuditJobStepContract,
} from "./job-step-contract.js";
import {
  inspectRepairWorktreeChanges,
  prepareRepairWorktree,
  removeRepairWorktree,
} from "./worktree-manager.js";
import { defaultAuditCapabilities } from "./types.js";

export interface AuditRepairFlowAcceptanceReport {
  ok: boolean;
  jobId: string;
  jobStepContractVersion: string;
  repairContractVersion: string;
  firstCheckStatus: string;
  repairExecutionStatus: string;
  repairReviewStatus: string;
  recheckStatus: string;
  finalJobStatus: string;
  sourceWorktreeClean: boolean;
  sourceWorktreePreserved: boolean;
  dirtyCleanupRetained: boolean;
  finalCleanupStatus: string;
  summary: string;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  }).trim();
}

function writeSyntheticProject(projectPath: string, checkBody: string): void {
  fs.writeFileSync(
    path.join(projectPath, "package.json"),
    JSON.stringify({
      name: "synthetic-audit-repair-target",
      version: "0.0.0",
      type: "module",
      scripts: {
        test: "node check.js",
      },
    }, null, 2),
  );
  fs.writeFileSync(path.join(projectPath, "check.js"), checkBody);
}

function assertCondition(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export async function runSyntheticAuditRepairFlowAcceptance(): Promise<AuditRepairFlowAcceptanceReport> {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "attys-audit-repair-"));
  const sourceRoot = path.join(tempRoot, "source");
  const repairBaseDir = path.join(tempRoot, "repair-worktrees");
  const jobId = "audit-flow-acceptance";
  const previousDatabasePath = process.env.DISCORD_DATABASE_PATH;
  let databaseInitialized = false;

  try {
    fs.mkdirSync(sourceRoot, { recursive: true });
    process.env.DISCORD_DATABASE_PATH = path.join(tempRoot, "bridge.sqlite");
    initDatabase();
    databaseInitialized = true;

    writeSyntheticProject(sourceRoot, "console.error('synthetic failure'); process.exit(1);\n");
    git(sourceRoot, ["init", "-b", "main"]);
    git(sourceRoot, ["config", "user.email", "synthetic@example.invalid"]);
    git(sourceRoot, ["config", "user.name", "Synthetic Test"]);
    git(sourceRoot, ["add", "package.json", "check.js"]);
    git(sourceRoot, ["commit", "-m", "Initial synthetic failure"]);

    const now = "2026-08-18T10:00:00.000Z";
    registerProject("channel-1", sourceRoot, "guild-1");
    createAuditJob({
      id: jobId,
      channelId: "channel-1",
      projectLabel: "<local-path>/synthetic-audit-repair-target",
      mode: "approved-repair",
      status: "running_checks",
      requestedCheck: "tests",
      currentStep: "tests",
      iteration: 0,
      maxIterations: 2,
      stopRequested: false,
      capabilities: defaultAuditCapabilities("approved-repair"),
      createdAt: now,
      updatedAt: now,
    });

    const firstRun = await runAuditCheckPipeline(sourceRoot, "tests");
    assertCondition(firstRun.length === 1, "first check did not produce exactly one result");
    assertCondition(firstRun[0].status === "failed", "first check did not fail as expected");
    insertAuditStepResult(jobId, firstRun[0]);
    updateAuditJobProgress(jobId, "waiting_manual_review", null, 0, "2026-08-18T10:01:00.000Z");

    const prepared = await prepareRepairWorktree({
      sourceRoot,
      jobId,
      baseDir: repairBaseDir,
    });
    createAuditRepairWorktree({
      jobId,
      worktreePath: prepared.worktreePath,
      branchName: prepared.branchName,
      headCommit: prepared.headCommit,
      status: "prepared",
      createdAt: "2026-08-18T10:02:00.000Z",
      updatedAt: "2026-08-18T10:02:00.000Z",
    });

    const jobBeforeRepair = getAuditJob(jobId);
    const repairWorktree = getAuditRepairWorktree(jobId);
    assertCondition(Boolean(jobBeforeRepair), "audit job was not persisted");
    assertCondition(Boolean(repairWorktree), "repair worktree was not persisted");
    const stepsBeforeRepair = listAuditSteps(jobId);
    const jobStepContract = buildAuditJobStepContract({
      job: jobBeforeRepair!,
      steps: stepsBeforeRepair,
    });
    assertCondition(
      validateAuditJobStepContract(jobStepContract, { job: jobBeforeRepair!, steps: stepsBeforeRepair }).length === 0,
      "audit job step contract was not valid",
    );

    const contract = buildAuditRepairContract({
      job: jobBeforeRepair!,
      steps: stepsBeforeRepair,
      repairWorktree,
      repairChangeSummary: inspectRepairWorktreeChanges(prepared.worktreePath).summary,
    });
    const prompt = buildAuditRepairPrompt(contract);

    updateAuditJobProgress(jobId, "repairing", "repair", 0, "2026-08-18T10:03:00.000Z");
    const execution = await startTrackedAuditRepairExecution({
      jobId,
      executionId: "repair-exec-acceptance",
      enabled: true,
      contract,
      prompt,
      worktreePath: prepared.worktreePath,
      startCodexRepair: async (worktreePath) => {
        fs.writeFileSync(path.join(worktreePath, "check.js"), "console.log('synthetic pass'); process.exit(0);\n");
        return { threadId: "thread-acceptance", turnId: "turn-acceptance" };
      },
    });
    assertCondition(execution.status === "started", "repair execution was not started");
    updateAuditJobProgress(jobId, "waiting_manual_review", null, 0, "2026-08-18T10:04:00.000Z");

    const persistedExecution = getAuditRepairExecution("repair-exec-acceptance");
    assertCondition(persistedExecution?.status === "started", "repair execution ledger did not record started status");

    const sourceCheckContents = fs.readFileSync(path.join(sourceRoot, "check.js"), "utf8");
    const sourceWorktreePreserved = sourceCheckContents.includes("synthetic failure");
    const dirtySummary = inspectRepairWorktreeChanges(prepared.worktreePath).summary;
    assertCondition(sourceWorktreePreserved, "source worktree was modified by repair execution");
    assertCondition(dirtySummary === "files=1 staged=0 unstaged=1 untracked=0", "repair worktree dirty summary was unexpected");

    updateAuditRepairExecutionResult(
      "repair-exec-acceptance",
      "reviewed",
      "operator reviewed repair execution: synthetic acceptance",
      "2026-08-18T10:05:00.000Z",
      "thread-acceptance",
      "turn-acceptance",
    );
    const reviewedExecution = getAuditRepairExecution("repair-exec-acceptance");
    assertCondition(reviewedExecution?.status === "reviewed", "repair execution was not marked reviewed");

    const recheckRun = await runAuditCheckPipeline(prepared.worktreePath, "tests");
    assertCondition(recheckRun.length === 1, "recheck did not produce exactly one result");
    assertCondition(recheckRun[0].status === "passed", "recheck did not pass after isolated repair");
    insertAuditStepResult(jobId, recheckRun[0]);
    updateAuditRepairWorktreeStatus(jobId, "prepared", "2026-08-18T10:06:00.000Z");
    updateAuditJobProgress(jobId, "completed", null, 1, "2026-08-18T10:06:00.000Z");

    let dirtyCleanupRetained = false;
    try {
      await removeRepairWorktree({
        sourceRoot,
        jobId,
        worktreePath: prepared.worktreePath,
        baseDir: repairBaseDir,
      });
    } catch {
      dirtyCleanupRetained = true;
      updateAuditRepairWorktreeStatus(jobId, "cleanup_failed", "2026-08-18T10:07:00.000Z");
    }
    assertCondition(dirtyCleanupRetained, "dirty repair worktree cleanup did not fail closed");

    git(prepared.worktreePath, ["checkout", "--", "check.js"]);
    const cleanup = await removeRepairWorktree({
      sourceRoot,
      jobId,
      worktreePath: prepared.worktreePath,
      baseDir: repairBaseDir,
    });
    updateAuditRepairWorktreeStatus(jobId, "removed", "2026-08-18T10:08:00.000Z");

    const sourceWorktreeClean = git(sourceRoot, ["status", "--porcelain"]) === "";
    const finalJob = getAuditJob(jobId);
    const finalRepairWorktree = getAuditRepairWorktree(jobId);
    assertCondition(sourceWorktreeClean, "source worktree was not clean after acceptance flow");
    assertCondition(finalJob?.status === "completed", "final audit job was not completed");
    assertCondition(finalRepairWorktree?.status === "removed", "repair worktree was not marked removed");

    return {
      ok: true,
      jobId,
      jobStepContractVersion: jobStepContract.version,
      repairContractVersion: contract.version,
      firstCheckStatus: firstRun[0].status,
      repairExecutionStatus: persistedExecution.status,
      repairReviewStatus: reviewedExecution.status,
      recheckStatus: recheckRun[0].status,
      finalJobStatus: finalJob.status,
      sourceWorktreeClean,
      sourceWorktreePreserved,
      dirtyCleanupRetained,
      finalCleanupStatus: cleanup.summary,
      summary: "synthetic audit repair flow passed",
    };
  } finally {
    const repairWorktreePath = path.join(repairBaseDir, jobId);
    if (fs.existsSync(sourceRoot) && fs.existsSync(path.join(sourceRoot, ".git")) && fs.existsSync(repairWorktreePath)) {
      try {
        git(sourceRoot, ["worktree", "remove", "--force", repairWorktreePath]);
      } catch {
        // Best-effort cleanup only. The acceptance path itself uses non-force cleanup.
      }
    }
    if (databaseInitialized) {
      try {
        getDb().close();
      } catch {
        // The test suite may replace the database implementation; cleanup remains best-effort.
      }
    }
    if (previousDatabasePath === undefined) {
      delete process.env.DISCORD_DATABASE_PATH;
    } else {
      process.env.DISCORD_DATABASE_PATH = previousDatabasePath;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}
