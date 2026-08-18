import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { windowsCmdInvocation } from "../utils/process.js";

export type WorkerSupervisorTarget = "nas" | "windows";
export type WorkerSupervisorState = "running" | "stopped" | "stale";

export interface WorkerSupervisorPaths {
  dir: string;
  pidFile: string;
  stdoutLog: string;
  stderrLog: string;
}

export interface WorkerSupervisorStatus {
  target: WorkerSupervisorTarget;
  state: WorkerSupervisorState;
  pid: number | null;
  log_name: string;
  error_log_name: string;
}

export interface WorkerSupervisorCommand {
  command: string;
  args: string[];
}

export interface WorkerSupervisorActionResult {
  ok: boolean;
  status: WorkerSupervisorStatus;
  message: string;
}

export type ProcessProbe = (processId: number) => boolean;
export type ProcessTerminator = (processId: number) => boolean;
export type WorkerStarter = (input: {
  command: string;
  args: string[];
  cwd: string;
  stdoutLog: string;
  stderrLog: string;
}) => number | null;

export function workerSupervisorPaths(
  repoRoot: string,
  target: WorkerSupervisorTarget,
  stateRoot = ".discord-bot-state/botops-workers",
): WorkerSupervisorPaths {
  const dir = path.resolve(repoRoot, stateRoot);
  return {
    dir,
    pidFile: path.join(dir, `${target}.pid`),
    stdoutLog: path.join(dir, `${target}.out.log`),
    stderrLog: path.join(dir, `${target}.err.log`),
  };
}

export function defaultProcessProbe(processId: number): boolean {
  if (!Number.isInteger(processId) || processId <= 0) return false;
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

export function defaultProcessTerminator(processId: number): boolean {
  if (!defaultProcessProbe(processId)) return false;
  try {
    process.kill(processId, "SIGTERM");
    return true;
  } catch {
    return false;
  }
}

export function buildWorkerSupervisorCommand(target: WorkerSupervisorTarget): WorkerSupervisorCommand {
  const script = target === "nas" ? "src/cli/botops-nas-worker.ts" : "src/cli/botops-windows-worker.ts";
  return {
    command: process.execPath,
    args: ["node_modules/tsx/dist/cli.mjs", script, "--loop"],
  };
}

export function readWorkerSupervisorStatus(
  repoRoot: string,
  target: WorkerSupervisorTarget,
  probe: ProcessProbe = defaultProcessProbe,
): WorkerSupervisorStatus {
  const paths = workerSupervisorPaths(repoRoot, target);
  const pid = readPid(paths.pidFile);
  const state = pid && probe(pid)
    ? "running"
    : pid
      ? "stale"
      : "stopped";

  return {
    target,
    state,
    pid,
    log_name: path.basename(paths.stdoutLog),
    error_log_name: path.basename(paths.stderrLog),
  };
}

export function formatWorkerSupervisorStatus(status: WorkerSupervisorStatus): string {
  return [
    `worker target: ${status.target}`,
    `state: ${status.state}`,
    `pid: ${status.pid ?? "none"}`,
    `log: ${status.log_name}`,
    `error log: ${status.error_log_name}`,
  ].join("\n");
}

export function startWorkerSupervisor(
  repoRoot: string,
  target: WorkerSupervisorTarget,
  probe: ProcessProbe = defaultProcessProbe,
  starter: WorkerStarter = defaultWorkerStarter,
): WorkerSupervisorActionResult {
  const before = readWorkerSupervisorStatus(repoRoot, target, probe);
  if (before.state === "running") {
    return {
      ok: true,
      status: before,
      message: "worker already running; no duplicate started",
    };
  }

  const paths = workerSupervisorPaths(repoRoot, target);
  fs.mkdirSync(paths.dir, { recursive: true });
  const command = buildWorkerSupervisorCommand(target);
  const pid = starter({
    ...command,
    cwd: repoRoot,
    stdoutLog: paths.stdoutLog,
    stderrLog: paths.stderrLog,
  });
  if (!pid) {
    return {
      ok: false,
      status: readWorkerSupervisorStatus(repoRoot, target, probe),
      message: "worker start failed",
    };
  }

  fs.writeFileSync(paths.pidFile, `${pid}\n`, "utf8");
  const after = readWorkerSupervisorStatus(repoRoot, target, (processId) => processId === pid || probe(processId));
  return {
    ok: true,
    status: after,
    message: before.state === "stale"
      ? "stale worker pid replaced; worker start requested"
      : "worker start requested",
  };
}

export function stopWorkerSupervisor(
  repoRoot: string,
  target: WorkerSupervisorTarget,
  probe: ProcessProbe = defaultProcessProbe,
  terminator: ProcessTerminator = defaultProcessTerminator,
  waitMs = 5_000,
): WorkerSupervisorActionResult {
  const status = readWorkerSupervisorStatus(repoRoot, target, probe);
  if (status.state === "stopped") {
    return {
      ok: true,
      status,
      message: "worker already stopped",
    };
  }

  const paths = workerSupervisorPaths(repoRoot, target);
  if (status.state === "stale") {
    fs.rmSync(paths.pidFile, { force: true });
    return {
      ok: true,
      status: readWorkerSupervisorStatus(repoRoot, target, probe),
      message: "stale worker pid removed",
    };
  }

  if (!status.pid || !terminator(status.pid)) {
    return {
      ok: false,
      status,
      message: "worker stop failed",
    };
  }

  const deadline = Date.now() + Math.max(0, waitMs);
  while (Date.now() < deadline && probe(status.pid)) {
    blockingSleep(100);
  }
  if (!probe(status.pid)) {
    fs.rmSync(paths.pidFile, { force: true });
    return {
      ok: true,
      status: readWorkerSupervisorStatus(repoRoot, target, probe),
      message: "worker stopped",
    };
  }

  return {
    ok: true,
    status,
    message: "worker stop requested",
  };
}

export async function restartWorkerSupervisor(
  repoRoot: string,
  target: WorkerSupervisorTarget,
  probe: ProcessProbe = defaultProcessProbe,
  terminator: ProcessTerminator = defaultProcessTerminator,
  starter: WorkerStarter = defaultWorkerStarter,
  waitMs = 5_000,
): Promise<WorkerSupervisorActionResult> {
  const before = readWorkerSupervisorStatus(repoRoot, target, probe);
  if (before.state === "running") {
    const stopped = stopWorkerSupervisor(repoRoot, target, probe, terminator, 0);
    if (!stopped.ok || !before.pid) return stopped;
    const deadline = Date.now() + Math.max(100, waitMs);
    while (Date.now() < deadline && probe(before.pid)) {
      await sleep(100);
    }
    if (probe(before.pid)) {
      return {
        ok: false,
        status: readWorkerSupervisorStatus(repoRoot, target, probe),
        message: "worker restart blocked: previous worker still running",
      };
    }
    fs.rmSync(workerSupervisorPaths(repoRoot, target).pidFile, { force: true });
  }

  return startWorkerSupervisor(repoRoot, target, probe, starter);
}

function defaultWorkerStarter(input: {
  command: string;
  args: string[];
  cwd: string;
  stdoutLog: string;
  stderrLog: string;
}): number | null {
  const stdout = fs.openSync(input.stdoutLog, "a");
  const stderr = fs.openSync(input.stderrLog, "a");
  const invocation = windowsCmdInvocation(input.command, input.args);
  try {
    const child = spawn(invocation.command, invocation.args, {
      cwd: input.cwd,
      detached: true,
      stdio: ["ignore", stdout, stderr],
      windowsHide: true,
      shell: false,
    });
    child.unref();
    return child.pid ?? null;
  } catch {
    fs.closeSync(stdout);
    fs.closeSync(stderr);
    return null;
  }
}

function readPid(pidFile: string): number | null {
  if (!fs.existsSync(pidFile)) return null;
  const raw = fs.readFileSync(pidFile, "utf8").trim();
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function blockingSleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
