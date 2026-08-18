import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { spawnSync } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$/;

export interface GitCommandResult {
  stdout: string;
  stderr: string;
}

export type GitCommandRunner = (
  args: string[],
  options: { cwd: string },
) => Promise<GitCommandResult>;

export interface PrepareRepairWorktreeOptions {
  sourceRoot: string;
  jobId: string;
  baseDir?: string;
  runGit?: GitCommandRunner;
}

export interface PreparedRepairWorktree {
  sourceRoot: string;
  worktreePath: string;
  branchName: string;
  headCommit: string;
}

export interface RepairWorktreeChangeSummary {
  available: boolean;
  summary: string;
  changedFiles: number;
  staged: number;
  unstaged: number;
  untracked: number;
}

export interface RemoveRepairWorktreeOptions {
  sourceRoot: string;
  jobId: string;
  worktreePath: string;
  baseDir?: string;
  runGit?: GitCommandRunner;
}

export interface RemoveRepairWorktreeResult {
  removed: boolean;
  summary: "removed" | "already removed";
}

export type RemoveAppliedRepairWorktreeResult = RemoveRepairWorktreeResult;
export type RemoveRevertedRepairWorktreeResult = RemoveRepairWorktreeResult;

async function defaultRunGit(args: string[], options: { cwd: string }): Promise<GitCommandResult> {
  const result = await execFileAsync("git", args, {
    cwd: options.cwd,
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 256 * 1024,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function assertSafeId(value: string, label: string): void {
  if (!SAFE_ID_PATTERN.test(value)) {
    throw new Error(`${label} must be a safe local identifier`);
  }
}

function assertPathInside(parent: string, child: string): void {
  const relative = path.relative(parent, child);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("repair worktree path escapes the configured worktree root");
  }
}

function assertNoReparseRisk(targetPath: string): void {
  let current = path.resolve(targetPath);
  const root = path.parse(current).root;
  const visited: string[] = [];

  while (current && current !== root) {
    visited.push(current);
    current = path.dirname(current);
  }
  visited.push(root);

  for (const entry of visited.reverse()) {
    if (!fs.existsSync(entry)) continue;
    const stats = fs.lstatSync(entry);
    if (stats.isSymbolicLink()) {
      throw new Error("repair worktree root cannot contain symlink or reparse-style path components");
    }
  }
}

async function ensureGitRoot(sourceRoot: string, runGit: GitCommandRunner): Promise<string> {
  const result = await runGit(["rev-parse", "--show-toplevel"], { cwd: sourceRoot });
  const gitRoot = path.resolve(result.stdout.trim());
  const resolvedSource = fs.realpathSync.native(sourceRoot);
  const resolvedGitRoot = fs.realpathSync.native(gitRoot);
  if (resolvedSource !== resolvedGitRoot) {
    throw new Error("repair source root must be the repository top-level");
  }
  return resolvedSource;
}

async function ensureCleanGitState(sourceRoot: string, runGit: GitCommandRunner): Promise<string> {
  const status = await runGit(["status", "--porcelain"], { cwd: sourceRoot });
  if (status.stdout.trim()) {
    throw new Error("repair requires a clean source worktree");
  }

  const gitDirResult = await runGit(["rev-parse", "--git-dir"], { cwd: sourceRoot });
  const gitDirRaw = gitDirResult.stdout.trim();
  const gitDir = path.isAbsolute(gitDirRaw) ? gitDirRaw : path.resolve(sourceRoot, gitDirRaw);
  const inProgressMarkers = [
    "MERGE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
    "BISECT_LOG",
    "rebase-apply",
    "rebase-merge",
  ];
  for (const marker of inProgressMarkers) {
    if (fs.existsSync(path.join(gitDir, marker))) {
      throw new Error("repair requires Git to be idle; an in-progress operation was detected");
    }
  }

  const head = await runGit(["rev-parse", "--verify", "HEAD"], { cwd: sourceRoot });
  return head.stdout.trim();
}

export async function prepareRepairWorktree(
  options: PrepareRepairWorktreeOptions,
): Promise<PreparedRepairWorktree> {
  assertSafeId(options.jobId, "jobId");
  const runGit = options.runGit ?? defaultRunGit;
  const sourceRoot = await ensureGitRoot(path.resolve(options.sourceRoot), runGit);
  const headCommit = await ensureCleanGitState(sourceRoot, runGit);
  const baseDir = path.resolve(options.baseDir ?? path.join(sourceRoot, ".discord-bot-state", "audit-worktrees"));
  const worktreePath = path.resolve(baseDir, options.jobId);
  assertPathInside(baseDir, worktreePath);
  assertNoReparseRisk(baseDir);

  if (fs.existsSync(worktreePath)) {
    throw new Error("repair worktree path already exists");
  }

  fs.mkdirSync(baseDir, { recursive: true });
  const branchName = `audit-repair/${options.jobId}`;
  await runGit(["worktree", "add", "-b", branchName, worktreePath, "HEAD"], { cwd: sourceRoot });

  return {
    sourceRoot,
    worktreePath,
    branchName,
    headCommit,
  };
}

export async function removeRepairWorktree(
  options: RemoveRepairWorktreeOptions,
): Promise<RemoveRepairWorktreeResult> {
  assertSafeId(options.jobId, "jobId");
  const runGit = options.runGit ?? defaultRunGit;
  const sourceRoot = await ensureGitRoot(path.resolve(options.sourceRoot), runGit);
  const baseDir = path.resolve(options.baseDir ?? path.join(sourceRoot, ".discord-bot-state", "audit-worktrees"));
  const expectedWorktreePath = path.resolve(baseDir, options.jobId);
  const worktreePath = path.resolve(options.worktreePath);
  assertPathInside(baseDir, worktreePath);
  assertNoReparseRisk(baseDir);

  if (worktreePath !== expectedWorktreePath) {
    throw new Error("repair worktree path does not match the audit job cleanup boundary");
  }

  if (!fs.existsSync(worktreePath)) {
    return { removed: false, summary: "already removed" };
  }

  await runGit(["worktree", "remove", worktreePath], { cwd: sourceRoot });
  return { removed: true, summary: "removed" };
}

function assertApplyCleanupStatus(status: string): void {
  const lines = status.split(/\r?\n/).filter((line) => line.length > 0);
  for (const line of lines) {
    if (line.startsWith("??")) {
      throw new Error("applied repair cleanup blocks untracked repair files");
    }
    if (line[0] && line[0] !== " ") {
      throw new Error("applied repair cleanup blocks staged, renamed, deleted, or conflicted repair changes");
    }
    if (line.slice(0, 2) !== " M") {
      throw new Error("applied repair cleanup only supports unstaged tracked repair modifications");
    }
  }
}

export async function removeAppliedRepairWorktree(
  options: RemoveRepairWorktreeOptions,
): Promise<RemoveAppliedRepairWorktreeResult> {
  assertSafeId(options.jobId, "jobId");
  const runGit = options.runGit ?? defaultRunGit;
  const sourceRoot = await ensureGitRoot(path.resolve(options.sourceRoot), runGit);
  const baseDirRaw = path.resolve(options.baseDir ?? path.join(sourceRoot, ".discord-bot-state", "audit-worktrees"));
  const baseDir = fs.existsSync(baseDirRaw) ? fs.realpathSync.native(baseDirRaw) : baseDirRaw;
  const expectedWorktreePath = path.resolve(baseDir, options.jobId);
  const requestedWorktreePath = path.resolve(options.worktreePath);
  assertNoReparseRisk(baseDirRaw);

  if (!fs.existsSync(requestedWorktreePath)) {
    const expectedRawWorktreePath = path.resolve(baseDirRaw, options.jobId);
    assertPathInside(baseDirRaw, requestedWorktreePath);
    if (requestedWorktreePath !== expectedRawWorktreePath) {
      throw new Error("repair worktree path does not match the audit job cleanup boundary");
    }
    return { removed: false, summary: "already removed" };
  }

  const repairRoot = await ensureGitRoot(requestedWorktreePath, runGit);
  assertPathInside(baseDir, repairRoot);

  if (repairRoot !== expectedWorktreePath) {
    throw new Error("repair worktree path does not match the audit job cleanup boundary");
  }

  const sourceHead = await runGit(["rev-parse", "--verify", "HEAD"], { cwd: sourceRoot });
  const repairHead = await runGit(["rev-parse", "--verify", "HEAD"], { cwd: repairRoot });
  if (sourceHead.stdout.trim() !== repairHead.stdout.trim()) {
    throw new Error("applied repair cleanup requires source and repair worktree to share the same HEAD");
  }

  const repairStatus = await runGit(["status", "--porcelain=v1"], { cwd: repairRoot });
  assertApplyCleanupStatus(repairStatus.stdout);
  const repairDiff = await runGit(["diff", "--binary"], { cwd: repairRoot });
  const sourceDiff = await runGit(["diff", "--binary"], { cwd: sourceRoot });
  if (repairDiff.stdout.trim() && repairDiff.stdout !== sourceDiff.stdout) {
    throw new Error("applied repair cleanup requires source and repair diffs to match");
  }

  if (repairDiff.stdout.trim()) {
    await runGit(["restore", "--worktree", "--", "."], { cwd: repairRoot });
  }
  await runGit(["worktree", "remove", repairRoot], { cwd: sourceRoot });
  return { removed: true, summary: "removed" };
}

export async function removeRevertedRepairWorktree(
  options: RemoveRepairWorktreeOptions,
): Promise<RemoveRevertedRepairWorktreeResult> {
  assertSafeId(options.jobId, "jobId");
  const runGit = options.runGit ?? defaultRunGit;
  const sourceRoot = await ensureGitRoot(path.resolve(options.sourceRoot), runGit);
  const baseDirRaw = path.resolve(options.baseDir ?? path.join(sourceRoot, ".discord-bot-state", "audit-worktrees"));
  const baseDir = fs.existsSync(baseDirRaw) ? fs.realpathSync.native(baseDirRaw) : baseDirRaw;
  const expectedWorktreePath = path.resolve(baseDir, options.jobId);
  const requestedWorktreePath = path.resolve(options.worktreePath);
  assertNoReparseRisk(baseDirRaw);

  if (!fs.existsSync(requestedWorktreePath)) {
    const expectedRawWorktreePath = path.resolve(baseDirRaw, options.jobId);
    assertPathInside(baseDirRaw, requestedWorktreePath);
    if (requestedWorktreePath !== expectedRawWorktreePath) {
      throw new Error("repair worktree path does not match the audit job cleanup boundary");
    }
    return { removed: false, summary: "already removed" };
  }

  const repairRoot = await ensureGitRoot(requestedWorktreePath, runGit);
  assertPathInside(baseDir, repairRoot);

  if (repairRoot !== expectedWorktreePath) {
    throw new Error("repair worktree path does not match the audit job cleanup boundary");
  }

  const sourceHead = await runGit(["rev-parse", "--verify", "HEAD"], { cwd: sourceRoot });
  const repairHead = await runGit(["rev-parse", "--verify", "HEAD"], { cwd: repairRoot });
  if (sourceHead.stdout.trim() !== repairHead.stdout.trim()) {
    throw new Error("reverted repair cleanup requires source and repair worktree to share the same HEAD");
  }

  const sourceStatus = await runGit(["status", "--porcelain=v1"], { cwd: sourceRoot });
  if (sourceStatus.stdout.trim()) {
    throw new Error("reverted repair cleanup requires a clean source worktree");
  }

  const repairStatus = await runGit(["status", "--porcelain=v1"], { cwd: repairRoot });
  assertApplyCleanupStatus(repairStatus.stdout);
  const repairDiff = await runGit(["diff", "--binary"], { cwd: repairRoot });
  if (repairDiff.stdout.trim()) {
    await runGit(["restore", "--worktree", "--", "."], { cwd: repairRoot });
  }
  await runGit(["worktree", "remove", repairRoot], { cwd: sourceRoot });
  return { removed: true, summary: "removed" };
}

export function inspectRepairWorktreeChanges(worktreePath: string): RepairWorktreeChangeSummary {
  if (!fs.existsSync(worktreePath)) {
    return {
      available: false,
      summary: "unavailable",
      changedFiles: 0,
      staged: 0,
      unstaged: 0,
      untracked: 0,
    };
  }

  const result = spawnSync("git", ["status", "--porcelain=v1"], {
    cwd: worktreePath,
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 128 * 1024,
  });
  if (result.status !== 0 || result.error) {
    return {
      available: false,
      summary: "unavailable",
      changedFiles: 0,
      staged: 0,
      unstaged: 0,
      untracked: 0,
    };
  }

  const lines = result.stdout.split(/\r?\n/).filter((line) => line.trim().length > 0);
  let staged = 0;
  let unstaged = 0;
  let untracked = 0;
  for (const line of lines) {
    if (line.startsWith("??")) {
      untracked += 1;
      continue;
    }
    if (line[0] && line[0] !== " ") staged += 1;
    if (line[1] && line[1] !== " ") unstaged += 1;
  }

  const changedFiles = lines.length;
  const summary = changedFiles === 0
    ? "clean"
    : `files=${changedFiles} staged=${staged} unstaged=${unstaged} untracked=${untracked}`;
  return {
    available: true,
    summary,
    changedFiles,
    staged,
    unstaged,
    untracked,
  };
}
