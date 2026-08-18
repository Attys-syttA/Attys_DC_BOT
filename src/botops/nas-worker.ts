import os from "node:os";
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

export interface FixedNasCommandResult {
  code: number;
  output: string;
}

export type FixedNasCommandRunner = (
  command: string,
  args: string[],
  timeoutMs: number,
) => FixedNasCommandResult;

export interface NasWorkerOnceResult {
  status: "idle" | "completed" | "failed";
  job?: BotOpsJob;
  result: string;
}

export interface NasWorkerStatusSnapshot {
  worker_id: string;
  host: string;
  capabilities: string[];
  queued_jobs: number;
  running_jobs: number;
  waiting_approval_jobs: number;
}

export const NAS_WORKER_CAPABILITIES = [
  "nas.worker.check",
  "nas.deploy.verify",
] as const satisfies readonly BotOpsCapability[];

export function defaultNasWorkerId(): string {
  return `nas-worker-${os.hostname()}`;
}

export function buildNasWorkerStatusSnapshot(workerId = defaultNasWorkerId()): NasWorkerStatusSnapshot {
  const jobs = listBotOpsJobs(25);
  return {
    worker_id: workerId,
    host: os.hostname(),
    capabilities: [...NAS_WORKER_CAPABILITIES],
    queued_jobs: jobs.filter((job) => job.target === "nas" && job.status === "Requested").length,
    running_jobs: jobs.filter((job) => job.target === "nas" && job.status === "Running").length,
    waiting_approval_jobs: jobs.filter((job) => job.target === "nas" && job.status === "WaitingApproval").length,
  };
}

export function formatNasWorkerStatus(snapshot: NasWorkerStatusSnapshot): string {
  return [
    `worker: ${snapshot.worker_id}`,
    `host: ${snapshot.host}`,
    `capabilities: ${snapshot.capabilities.join(", ")}`,
    `queued jobs: ${snapshot.queued_jobs}`,
    `running jobs: ${snapshot.running_jobs}`,
    `waiting approval jobs: ${snapshot.waiting_approval_jobs}`,
  ].join("\n");
}

export function recordNasWorkerStatus(
  snapshot: NasWorkerStatusSnapshot,
  status: string,
  detail: string,
  now = new Date(),
): void {
  recordBotOpsWorkerHeartbeat({
    worker_id: snapshot.worker_id,
    target: "nas",
    host: snapshot.host,
    capabilities: NAS_WORKER_CAPABILITIES,
    status,
    detail,
    now,
  });
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export function defaultFixedNasCommandRunner(
  command: string,
  args: string[],
  timeoutMs: number,
): FixedNasCommandResult {
  const invocation = windowsCmdInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: process.cwd(),
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

function runNasDeployVerifyHelper(
  runner: FixedNasCommandRunner,
): { ok: boolean; result: string } {
  const verification = runner(npmCommand(), ["run", "nas:deploy:verify"], 120_000);
  return {
    ok: verification.code === 0,
    result: verification.code === 0
      ? "NAS deploy verify helper completed: verifier passed"
      : "NAS deploy verify helper failed: verifier failed",
  };
}

export function runNasWorkerOnce(
  workerId = defaultNasWorkerId(),
  now = new Date(),
  runner: FixedNasCommandRunner = defaultFixedNasCommandRunner,
): NasWorkerOnceResult {
  const job = acquireNextBotOpsJob(
    workerId,
    "nas",
    NAS_WORKER_CAPABILITIES,
    30_000,
    now,
  );

  if (!job) {
    recordNasWorkerStatus(buildNasWorkerStatusSnapshot(workerId), "idle", "no requested NAS worker job", now);
    return {
      status: "idle",
      result: "no requested NAS worker job",
    };
  }

  recordBotOpsHeartbeat(job.job_id, workerId, new Date(now.getTime() + 100));

  if (job.capability === "nas.deploy.verify") {
    const execution = runNasDeployVerifyHelper(runner);
    completeBotOpsJob(job.job_id, workerId, execution.ok ? "Completed" : "Failed", execution.result, new Date(now.getTime() + 200));
    recordNasWorkerStatus(buildNasWorkerStatusSnapshot(workerId), execution.ok ? "completed" : "failed", `nas.deploy.verify: ${execution.ok ? "completed" : "failed"}`, new Date(now.getTime() + 200));
    return {
      status: execution.ok ? "completed" : "failed",
      job,
      result: execution.result,
    };
  }

  if (job.capability !== "nas.worker.check") {
    completeBotOpsJob(job.job_id, workerId, "Failed", `unsupported NAS capability: ${job.capability}`);
    recordNasWorkerStatus(buildNasWorkerStatusSnapshot(workerId), "failed", "unsupported NAS capability", new Date(now.getTime() + 200));
    return {
      status: "failed",
      job,
      result: "unsupported NAS capability",
    };
  }

  const snapshot = buildNasWorkerStatusSnapshot(workerId);
  const result = [
    "NAS worker check completed",
    formatNasWorkerStatus(snapshot),
  ].join("\n");
  completeBotOpsJob(job.job_id, workerId, "Completed", result, new Date(now.getTime() + 200));
  recordNasWorkerStatus(snapshot, "completed", `completed ${job.job_id}`, new Date(now.getTime() + 200));

  return {
    status: "completed",
    job,
    result,
  };
}
