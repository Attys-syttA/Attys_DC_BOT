import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  acquireNextBotOpsJob,
  completeBotOpsJob,
  listBotOpsJobs,
  recordBotOpsHeartbeat,
  recordBotOpsWorkerHeartbeat,
} from "../db/database.js";
import { windowsCmdInvocation } from "../utils/process.js";
import type { BotOpsCapability, BotOpsJob } from "./contract.js";

export interface FixedCommandResult {
  code: number;
  output: string;
}

export type FixedCommandRunner = (
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
) => FixedCommandResult;

export interface WindowsWorkerOnceResult {
  status: "idle" | "completed" | "failed";
  job?: BotOpsJob;
  result: string;
}

export interface WindowsWorkerStatusSnapshot {
  worker_id: string;
  host: string;
  capabilities: string[];
  queued_jobs: number;
  running_jobs: number;
  waiting_approval_jobs: number;
  worktree: "clean" | "dirty" | "unknown";
  bot_lock: "free" | "active" | "stale" | "unknown";
  config: "present" | "missing";
}

export const WINDOWS_WORKER_CAPABILITIES = [
  "status.read",
  "audit.check",
  "git.commit",
  "git.push",
  "service.restart",
] as const satisfies readonly BotOpsCapability[];

export const WINDOWS_TARGET_REPO_ROOT_ENV = "BOTOPS_WINDOWS_TARGET_REPO_ROOT";

export function defaultWindowsWorkerId(): string {
  return `windows-worker-${os.hostname()}`;
}

export function resolveWindowsWorkerRepoRoot(
  fallbackRepoRoot = process.cwd(),
  configuredRepoRoot = process.env[WINDOWS_TARGET_REPO_ROOT_ENV],
): string {
  const configured = configuredRepoRoot?.trim();
  if (configured && !path.isAbsolute(configured)) {
    throw new Error(`${WINDOWS_TARGET_REPO_ROOT_ENV} must be an absolute path`);
  }

  const resolved = path.resolve(configured || fallbackRepoRoot);
  try {
    if (!fs.statSync(resolved).isDirectory()) {
      throw new Error("not a directory");
    }
  } catch {
    throw new Error(`${WINDOWS_TARGET_REPO_ROOT_ENV} must point to an existing directory`);
  }

  return resolved;
}

export function defaultFixedCommandRunner(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): FixedCommandResult {
  const invocation = windowsCmdInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd,
    encoding: "utf-8",
    timeout: timeoutMs,
    windowsHide: true,
    shell: false,
  });
  return {
    code: result.status ?? 1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
  };
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export function readWorktreeState(
  repoRoot: string,
  runner: FixedCommandRunner = defaultFixedCommandRunner,
): "clean" | "dirty" | "unknown" {
  const result = runner("git", ["status", "--porcelain"], repoRoot, 10_000);
  if (result.code !== 0) return "unknown";
  return result.output.trim() ? "dirty" : "clean";
}

export function readBotLockState(repoRoot: string): "free" | "active" | "stale" | "unknown" {
  const lockPath = path.join(repoRoot, ".bot.lock");
  if (!fs.existsSync(lockPath)) return "free";
  try {
    const processId = Number.parseInt(fs.readFileSync(lockPath, "utf8").trim(), 10);
    if (!Number.isInteger(processId) || processId <= 0) return "stale";
    try {
      process.kill(processId, 0);
      return "active";
    } catch {
      return "stale";
    }
  } catch {
    return "unknown";
  }
}

export function readWorkerConfigState(repoRoot: string): "present" | "missing" {
  if (process.env.BASE_PROJECT_DIR) return "present";
  return fs.existsSync(path.join(repoRoot, ".env")) ? "present" : "missing";
}

export function buildWindowsWorkerStatusSnapshot(
  repoRoot: string,
  workerId = defaultWindowsWorkerId(),
  runner: FixedCommandRunner = defaultFixedCommandRunner,
): WindowsWorkerStatusSnapshot {
  const jobs = listBotOpsJobs(25);
  return {
    worker_id: workerId,
    host: os.hostname(),
    capabilities: [...WINDOWS_WORKER_CAPABILITIES],
    queued_jobs: jobs.filter((job) => job.target === "windows" && job.status === "Requested").length,
    running_jobs: jobs.filter((job) => job.target === "windows" && job.status === "Running").length,
    waiting_approval_jobs: jobs.filter((job) => job.target === "windows" && job.status === "WaitingApproval").length,
    worktree: readWorktreeState(repoRoot, runner),
    bot_lock: readBotLockState(repoRoot),
    config: readWorkerConfigState(repoRoot),
  };
}

export function formatWindowsWorkerStatus(snapshot: WindowsWorkerStatusSnapshot): string {
  return [
    `worker: ${snapshot.worker_id}`,
    `host: ${snapshot.host}`,
    `capabilities: ${snapshot.capabilities.join(", ")}`,
    `queued jobs: ${snapshot.queued_jobs}`,
    `running jobs: ${snapshot.running_jobs}`,
    `waiting approval jobs: ${snapshot.waiting_approval_jobs}`,
    `worktree: ${snapshot.worktree}`,
    `bot lock: ${snapshot.bot_lock}`,
    `config: ${snapshot.config}`,
  ].join("\n");
}

export function recordWindowsWorkerStatus(
  snapshot: WindowsWorkerStatusSnapshot,
  status: string,
  detail: string,
  now = new Date(),
): void {
  recordBotOpsWorkerHeartbeat({
    worker_id: snapshot.worker_id,
    target: "windows",
    host: snapshot.host,
    capabilities: WINDOWS_WORKER_CAPABILITIES,
    status,
    detail,
    now,
  });
}

function runStatusHelper(
  repoRoot: string,
  workerId: string,
  runner: FixedCommandRunner,
): { ok: boolean; result: string } {
  const snapshot = buildWindowsWorkerStatusSnapshot(repoRoot, workerId, runner);
  return {
    ok: true,
    result: [
      "Windows worker status completed",
      formatWindowsWorkerStatus(snapshot),
    ].join("\n"),
  };
}

function runCheckHelper(
  repoRoot: string,
  workerId: string,
  runner: FixedCommandRunner,
): { ok: boolean; result: string } {
  const snapshot = buildWindowsWorkerStatusSnapshot(repoRoot, workerId, runner);
  if (snapshot.worktree !== "clean") {
    return {
      ok: false,
      result: `check helper blocked: worktree ${snapshot.worktree}`,
    };
  }
  if (snapshot.config === "missing") {
    return {
      ok: false,
      result: "check helper blocked: config missing",
    };
  }

  const result = runner(npmCommand(), ["run", "check"], repoRoot, 120_000);
  return {
    ok: result.code === 0,
    result: result.code === 0
      ? "check helper completed: npm run check passed"
      : "check helper failed: npm run check failed",
  };
}

function runServiceRestartHelper(
  repoRoot: string,
  workerId: string,
  runner: FixedCommandRunner,
): { ok: boolean; result: string } {
  const snapshot = buildWindowsWorkerStatusSnapshot(repoRoot, workerId, runner);
  if (snapshot.worktree !== "clean") {
    return {
      ok: false,
      result: `service restart blocked: worktree ${snapshot.worktree}`,
    };
  }
  if (snapshot.config === "missing") {
    return {
      ok: false,
      result: "service restart blocked: config missing",
    };
  }
  if (snapshot.bot_lock === "stale" || snapshot.bot_lock === "unknown") {
    return {
      ok: false,
      result: `service restart blocked: bot lock ${snapshot.bot_lock}`,
    };
  }
  if (!fs.existsSync(path.join(repoRoot, "win-start.bat"))) {
    return {
      ok: false,
      result: "service restart blocked: win-start.bat missing",
    };
  }

  const result = runner("cmd", ["/c", "win-start.bat"], repoRoot, 120_000);
  return {
    ok: result.code === 0,
    result: result.code === 0
      ? "service restart helper completed: win-start.bat returned success"
      : "service restart helper failed: win-start.bat returned failure",
  };
}

function parseGitStatusPorcelain(output: string): {
  staged: number;
  unstaged: number;
  untracked: number;
} {
  const lines = output.split(/\r?\n/).filter((line) => line.trim());
  let staged = 0;
  let unstaged = 0;
  let untracked = 0;
  for (const line of lines) {
    const indexStatus = line[0] ?? " ";
    const worktreeStatus = line[1] ?? " ";
    if (indexStatus === "?" && worktreeStatus === "?") {
      untracked += 1;
      continue;
    }
    if (indexStatus !== " ") staged += 1;
    if (worktreeStatus !== " ") unstaged += 1;
  }
  return { staged, unstaged, untracked };
}

function readCommitMessage(job: BotOpsJob): string | undefined {
  if (!job.payload_json.trim()) return undefined;
  try {
    const parsed = JSON.parse(job.payload_json) as { message?: unknown };
    const message = typeof parsed.message === "string" ? parsed.message.trim() : "";
    if (!message || message.length > 180 || /[\r\n]/.test(message)) return undefined;
    return message;
  } catch {
    return undefined;
  }
}

function runGitCommitHelper(
  repoRoot: string,
  job: BotOpsJob,
  runner: FixedCommandRunner,
): { ok: boolean; result: string } {
  const message = readCommitMessage(job);
  if (!message) {
    return {
      ok: false,
      result: "git commit blocked: valid commit message missing",
    };
  }

  const status = runner("git", ["status", "--porcelain"], repoRoot, 10_000);
  if (status.code !== 0) {
    return {
      ok: false,
      result: "git commit blocked: worktree unknown",
    };
  }

  const parsed = parseGitStatusPorcelain(status.output);
  if (parsed.staged === 0) {
    return {
      ok: false,
      result: "git commit blocked: no staged changes",
    };
  }
  if (parsed.unstaged > 0 || parsed.untracked > 0) {
    return {
      ok: false,
      result: `git commit blocked: unstaged=${parsed.unstaged} untracked=${parsed.untracked}`,
    };
  }

  const whitespace = runner("git", ["diff", "--check", "--cached"], repoRoot, 30_000);
  if (whitespace.code !== 0) {
    return {
      ok: false,
      result: "git commit blocked: staged diff check failed",
    };
  }

  const secrets = runner("ggshield", ["secret", "scan", "path", "--recursive", "--yes", "--use-gitignore", "."], repoRoot, 120_000);
  if (secrets.code !== 0) {
    return {
      ok: false,
      result: "git commit blocked: secret scan failed",
    };
  }

  const commit = runner("git", ["commit", "-m", message], repoRoot, 120_000);
  return {
    ok: commit.code === 0,
    result: commit.code === 0
      ? "git commit helper completed: staged changes committed"
      : "git commit helper failed: git commit returned failure",
  };
}

function parseAheadBehind(output: string): { ahead: number; behind: number } | undefined {
  const [aheadText, behindText] = output.trim().split(/\s+/);
  const ahead = Number.parseInt(aheadText ?? "", 10);
  const behind = Number.parseInt(behindText ?? "", 10);
  if (!Number.isInteger(ahead) || !Number.isInteger(behind) || ahead < 0 || behind < 0) {
    return undefined;
  }
  return { ahead, behind };
}

function runGitPushHelper(
  repoRoot: string,
  workerId: string,
  runner: FixedCommandRunner,
): { ok: boolean; result: string } {
  const snapshot = buildWindowsWorkerStatusSnapshot(repoRoot, workerId, runner);
  if (snapshot.worktree !== "clean") {
    return {
      ok: false,
      result: `git push blocked: worktree ${snapshot.worktree}`,
    };
  }

  const upstream = runner("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], repoRoot, 10_000);
  if (upstream.code !== 0 || !upstream.output.trim()) {
    return {
      ok: false,
      result: "git push blocked: upstream missing",
    };
  }

  const counts = runner("git", ["rev-list", "--left-right", "--count", "HEAD...@{u}"], repoRoot, 10_000);
  const parsed = counts.code === 0 ? parseAheadBehind(counts.output) : undefined;
  if (!parsed) {
    return {
      ok: false,
      result: "git push blocked: upstream comparison failed",
    };
  }
  if (parsed.behind > 0) {
    return {
      ok: false,
      result: `git push blocked: upstream behind=${parsed.behind}`,
    };
  }
  if (parsed.ahead === 0) {
    return {
      ok: true,
      result: "git push helper completed: nothing to push",
    };
  }

  const push = runner("git", ["push"], repoRoot, 120_000);
  return {
    ok: push.code === 0,
    result: push.code === 0
      ? `git push helper completed: pushed ${parsed.ahead} commit(s)`
      : "git push helper failed: git push returned failure",
  };
}

export function runWindowsWorkerOnce(
  repoRoot: string,
  workerId = defaultWindowsWorkerId(),
  runner: FixedCommandRunner = defaultFixedCommandRunner,
  now = new Date(),
): WindowsWorkerOnceResult {
  const job = acquireNextBotOpsJob(
    workerId,
    "windows",
    WINDOWS_WORKER_CAPABILITIES,
    30_000,
    now,
  );

  if (!job) {
    recordWindowsWorkerStatus(
      buildWindowsWorkerStatusSnapshot(repoRoot, workerId, runner),
      "idle",
      "no requested Windows worker job",
      now,
    );
    return {
      status: "idle",
      result: "no requested Windows worker job",
    };
  }

  recordBotOpsHeartbeat(job.job_id, workerId, new Date(now.getTime() + 100));

  const execution = job.capability === "status.read"
    ? runStatusHelper(repoRoot, workerId, runner)
    : job.capability === "audit.check"
      ? runCheckHelper(repoRoot, workerId, runner)
      : job.capability === "git.commit"
        ? runGitCommitHelper(repoRoot, job, runner)
        : job.capability === "git.push"
          ? runGitPushHelper(repoRoot, workerId, runner)
          : job.capability === "service.restart"
            ? runServiceRestartHelper(repoRoot, workerId, runner)
            : { ok: false, result: `unsupported Windows capability: ${job.capability}` };

  completeBotOpsJob(
    job.job_id,
    workerId,
    execution.ok ? "Completed" : "Failed",
    execution.result,
    new Date(now.getTime() + 200),
  );
  recordWindowsWorkerStatus(
    buildWindowsWorkerStatusSnapshot(repoRoot, workerId, runner),
    execution.ok ? "completed" : "failed",
    `${job.capability}: ${execution.ok ? "completed" : "failed"}`,
    new Date(now.getTime() + 200),
  );

  return {
    status: execution.ok ? "completed" : "failed",
    job,
    result: execution.result,
  };
}
