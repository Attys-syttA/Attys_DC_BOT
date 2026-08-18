import os from "node:os";
import {
  acquireNextBotOpsJob,
  completeBotOpsJob,
  listBotOpsJobs,
  recordBotOpsHeartbeat,
  recordBotOpsWorkerHeartbeat,
} from "../db/database.js";
import type { BotOpsCapability, BotOpsJob } from "./contract.js";

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

export const NAS_WORKER_CAPABILITIES = ["nas.worker.check"] as const satisfies readonly BotOpsCapability[];

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

export function runNasWorkerOnce(
  workerId = defaultNasWorkerId(),
  now = new Date(),
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
