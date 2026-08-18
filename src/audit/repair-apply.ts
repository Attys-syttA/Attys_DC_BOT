import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { AuditCheckName } from "./check-catalog.js";
import {
  runAuditCheckPipeline,
  type AuditCheckRunResult,
} from "./check-runner.js";
import type { GitCommandResult } from "./worktree-manager.js";
import { sanitizePublicText } from "../utils/public-safety.js";

const execFileAsync = promisify(execFile);

export type RepairApplyGitRunner = (
  args: string[],
  options: { cwd: string },
) => Promise<GitCommandResult>;

export type RepairApplyGitInputRunner = (
  args: string[],
  options: { cwd: string; input: string },
) => Promise<GitCommandResult>;

export interface ApplyRepairWorktreeChangesOptions {
  sourceRoot: string;
  worktreePath: string;
  requestedCheck: AuditCheckName;
  runGit?: RepairApplyGitRunner;
  runGitWithInput?: RepairApplyGitInputRunner;
  runChecks?: typeof runAuditCheckPipeline;
}

export interface ApplyRepairWorktreeChangesResult {
  changedFiles: number;
  summary: string;
  validationResults: AuditCheckRunResult[];
  validationPassed: boolean;
}

export type RevertAppliedRepairWorktreeChangesOptions = ApplyRepairWorktreeChangesOptions;
export type RevertAppliedRepairWorktreeChangesResult = ApplyRepairWorktreeChangesResult;

async function defaultRunGit(args: string[], options: { cwd: string }): Promise<GitCommandResult> {
  const result = await execFileAsync("git", args, {
    cwd: options.cwd,
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 512 * 1024,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function defaultRunGitWithInput(
  args: string[],
  options: { cwd: string; input: string },
): Promise<GitCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: options.cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill();
    }, 30_000);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `git exited with code ${code}`));
    });
    child.stdin.end(options.input, "utf8");
  });
}

async function ensureGitRoot(root: string, runGit: RepairApplyGitRunner, label: string): Promise<string> {
  const resolvedRoot = path.resolve(root);
  const result = await runGit(["rev-parse", "--show-toplevel"], { cwd: resolvedRoot });
  const gitRoot = path.resolve(result.stdout.trim());
  const realRoot = fs.realpathSync.native(resolvedRoot);
  const realGitRoot = fs.realpathSync.native(gitRoot);
  if (realRoot !== realGitRoot) {
    throw new Error(`${label} must be the repository top-level`);
  }
  return realRoot;
}

async function ensureSourceIsClean(sourceRoot: string, runGit: RepairApplyGitRunner): Promise<void> {
  const status = await runGit(["status", "--porcelain=v1"], { cwd: sourceRoot });
  if (status.stdout.trim()) {
    throw new Error("repair apply requires a clean source worktree");
  }
}

function parseRepairStatus(output: string): string[] {
  return output
    .split("\0")
    .filter((entry) => entry.length > 0);
}

function changedPathFromStatusEntry(entry: string): string {
  return entry.slice(3);
}

async function getApplyableChangedPaths(worktreePath: string, runGit: RepairApplyGitRunner): Promise<string[]> {
  const status = await runGit(["status", "--porcelain=v1", "-z"], { cwd: worktreePath });
  const entries = parseRepairStatus(status.stdout);
  if (entries.length === 0) {
    throw new Error("repair worktree has no changes to apply");
  }

  const paths: string[] = [];
  for (const entry of entries) {
    const state = entry.slice(0, 2);
    if (state === "??") {
      throw new Error("repair apply blocks untracked files; review them manually");
    }
    if (state[0] !== " ") {
      throw new Error("repair apply blocks staged, renamed, deleted, or conflicted changes");
    }
    if (state !== " M") {
      throw new Error("repair apply only supports unstaged tracked file modifications");
    }
    const changedPath = changedPathFromStatusEntry(entry);
    if (!changedPath) {
      throw new Error("repair apply could not parse changed file status safely");
    }
    paths.push(changedPath);
  }
  return paths;
}

async function getRevertableSourceChangedPaths(sourceRoot: string, runGit: RepairApplyGitRunner): Promise<string[]> {
  const status = await runGit(["status", "--porcelain=v1", "-z"], { cwd: sourceRoot });
  const entries = parseRepairStatus(status.stdout);
  if (entries.length === 0) {
    throw new Error("repair revert requires source worktree changes to revert");
  }

  const paths: string[] = [];
  for (const entry of entries) {
    const state = entry.slice(0, 2);
    if (state === "??") {
      throw new Error("repair revert blocks untracked source files; review them manually");
    }
    if (state[0] !== " ") {
      throw new Error("repair revert blocks staged, renamed, deleted, or conflicted source changes");
    }
    if (state !== " M") {
      throw new Error("repair revert only supports unstaged tracked source modifications");
    }
    const changedPath = changedPathFromStatusEntry(entry);
    if (!changedPath) {
      throw new Error("repair revert could not parse changed file status safely");
    }
    paths.push(changedPath);
  }
  return paths;
}

function samePathSet(left: string[], right: string[]): boolean {
  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

async function ensureSameHead(sourceRoot: string, worktreePath: string, runGit: RepairApplyGitRunner): Promise<void> {
  const sourceHead = await runGit(["rev-parse", "--verify", "HEAD"], { cwd: sourceRoot });
  const repairHead = await runGit(["rev-parse", "--verify", "HEAD"], { cwd: worktreePath });
  if (sourceHead.stdout.trim() !== repairHead.stdout.trim()) {
    throw new Error("repair apply requires source and repair worktree to share the same HEAD");
  }
}

export async function applyRepairWorktreeChanges(
  options: ApplyRepairWorktreeChangesOptions,
): Promise<ApplyRepairWorktreeChangesResult> {
  const runGit = options.runGit ?? defaultRunGit;
  const runGitWithInput = options.runGitWithInput ?? defaultRunGitWithInput;
  const runChecks = options.runChecks ?? runAuditCheckPipeline;
  const sourceRoot = await ensureGitRoot(options.sourceRoot, runGit, "source root");
  const worktreePath = await ensureGitRoot(options.worktreePath, runGit, "repair worktree");

  await ensureSourceIsClean(sourceRoot, runGit);
  await ensureSameHead(sourceRoot, worktreePath, runGit);

  const changedPaths = await getApplyableChangedPaths(worktreePath, runGit);
  const diff = await runGit(["diff", "--binary", "--", ...changedPaths], { cwd: worktreePath });
  if (!diff.stdout.trim()) {
    throw new Error("repair worktree produced an empty patch");
  }

  await runGitWithInput(["apply", "--check", "--whitespace=nowarn"], { cwd: sourceRoot, input: diff.stdout });
  await runGitWithInput(["apply", "--whitespace=nowarn"], { cwd: sourceRoot, input: diff.stdout });

  let validationResults: AuditCheckRunResult[];
  try {
    validationResults = await runChecks(sourceRoot, options.requestedCheck);
  } catch (error) {
    const now = new Date().toISOString();
    validationResults = [{
      name: options.requestedCheck,
      status: "error",
      exitCode: null,
      timedOut: false,
      stopped: false,
      publicOutput: sanitizePublicText(
        error instanceof Error ? error.message : "source validation runner error",
        1_800,
      ) || "source validation runner error",
      startedAt: now,
      finishedAt: now,
      durationMs: 0,
    }];
  }
  return {
    changedFiles: changedPaths.length,
    summary: `applied files=${changedPaths.length}`,
    validationResults,
    validationPassed: validationResults.length > 0 && validationResults.every((result) => result.status === "passed"),
  };
}

export async function revertAppliedRepairWorktreeChanges(
  options: RevertAppliedRepairWorktreeChangesOptions,
): Promise<RevertAppliedRepairWorktreeChangesResult> {
  const runGit = options.runGit ?? defaultRunGit;
  const runGitWithInput = options.runGitWithInput ?? defaultRunGitWithInput;
  const runChecks = options.runChecks ?? runAuditCheckPipeline;
  const sourceRoot = await ensureGitRoot(options.sourceRoot, runGit, "source root");
  const worktreePath = await ensureGitRoot(options.worktreePath, runGit, "repair worktree");

  await ensureSameHead(sourceRoot, worktreePath, runGit);

  const repairChangedPaths = await getApplyableChangedPaths(worktreePath, runGit);
  const sourceChangedPaths = await getRevertableSourceChangedPaths(sourceRoot, runGit);
  if (!samePathSet(repairChangedPaths, sourceChangedPaths)) {
    throw new Error("repair revert requires source and repair changed paths to match");
  }

  const repairDiff = await runGit(["diff", "--binary", "--", ...repairChangedPaths], { cwd: worktreePath });
  const sourceDiff = await runGit(["diff", "--binary", "--", ...sourceChangedPaths], { cwd: sourceRoot });
  if (!repairDiff.stdout.trim() || repairDiff.stdout !== sourceDiff.stdout) {
    throw new Error("repair revert requires source and repair diffs to match");
  }

  await runGitWithInput(["apply", "-R", "--check", "--whitespace=nowarn"], { cwd: sourceRoot, input: repairDiff.stdout });
  await runGitWithInput(["apply", "-R", "--whitespace=nowarn"], { cwd: sourceRoot, input: repairDiff.stdout });
  await runGit(["restore", "--worktree", "--", ...sourceChangedPaths], { cwd: sourceRoot });

  let validationResults: AuditCheckRunResult[];
  try {
    validationResults = await runChecks(sourceRoot, options.requestedCheck);
  } catch (error) {
    const now = new Date().toISOString();
    validationResults = [{
      name: options.requestedCheck,
      status: "error",
      exitCode: null,
      timedOut: false,
      stopped: false,
      publicOutput: sanitizePublicText(
        error instanceof Error ? error.message : "source validation runner error",
        1_800,
      ) || "source validation runner error",
      startedAt: now,
      finishedAt: now,
      durationMs: 0,
    }];
  }

  return {
    changedFiles: repairChangedPaths.length,
    summary: `reverted files=${repairChangedPaths.length}`,
    validationResults,
    validationPassed: validationResults.length > 0 && validationResults.every((result) => result.status === "passed"),
  };
}
