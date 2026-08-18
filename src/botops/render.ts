import type { BotOpsEventRecord, BotOpsWorkerHeartbeatRecord } from "../db/types.js";
import type { BotOpsJob } from "./contract.js";

export function formatBotOpsJobLine(job: BotOpsJob): string {
  const approval = job.approval_state === "not_required" ? "" : ` approval=${job.approval_state}`;
  const risk = job.status === "WaitingApproval" && job.approval_state === "required" ? " dangerous=yes" : "";
  const result = job.status === "WaitingWorker" && job.result ? ` result=${job.result}` : "";
  return `- ${job.job_id}: ${job.status} ${job.target}/${job.capability}${approval}${risk}${result}`;
}

export function formatBotOpsJobDetails(job: BotOpsJob): string {
  return [
    `job: ${job.job_id}`,
    `status: ${job.status}`,
    `target: ${job.target}`,
    `capability: ${job.capability}`,
    `approval: ${job.approval_state}`,
    `approval expires: ${job.approval_expires_at ?? "none"}`,
    `expected action: ${job.expected_action}`,
    `validation: ${job.validation_condition}`,
    `summary: ${job.summary}`,
    `lease: ${job.lease_owner ?? "none"}`,
    `lease expires: ${job.lease_expires_at ?? "none"}`,
    `heartbeat: ${job.heartbeat_at ?? "none"}`,
    `result: ${job.result || "none"}`,
  ].join("\n");
}

export function buildBotOpsJobsReply(jobs: BotOpsJob[]): string {
  if (jobs.length === 0) {
    return "**BotOps jobs**\nNo BotOps jobs recorded yet.";
  }

  return [
    "**BotOps jobs**",
    "```text",
    ...jobs.map(formatBotOpsJobLine),
    "```",
  ].join("\n");
}

export function formatBotOpsEventLine(event: BotOpsEventRecord): string {
  return `- ${event.created_at} ${event.event_type} actor=${event.actor} ${event.detail}`;
}

export function formatBotOpsEventDetails(events: BotOpsEventRecord[]): string {
  if (events.length === 0) {
    return "events: none";
  }

  return [
    "events:",
    ...events.map(formatBotOpsEventLine),
  ].join("\n");
}

export function formatBotOpsWorkerHeartbeatLine(
  heartbeat: BotOpsWorkerHeartbeatRecord,
  now = new Date(),
  staleAfterMs = 120_000,
): string {
  const heartbeatTime = Date.parse(heartbeat.heartbeat_at);
  const freshness = Number.isFinite(heartbeatTime) && now.getTime() - heartbeatTime <= staleAfterMs
    ? "fresh"
    : "stale";
  return `- ${heartbeat.worker_id}: ${heartbeat.status} ${freshness} at ${heartbeat.heartbeat_at} capabilities=${heartbeat.capabilities}`;
}

export function formatBotOpsWorkerHeartbeats(
  heartbeats: BotOpsWorkerHeartbeatRecord[],
  now = new Date(),
  staleAfterMs = 120_000,
): string {
  if (heartbeats.length === 0) {
    return "worker heartbeats: none";
  }

  return [
    "worker heartbeats:",
    ...heartbeats.map((heartbeat) => formatBotOpsWorkerHeartbeatLine(heartbeat, now, staleAfterMs)),
  ].join("\n");
}

export function formatBotOpsNextDecision(jobs: BotOpsJob[]): string {
  const waitingApproval = jobs.find((job) => job.status === "WaitingApproval");
  if (waitingApproval) {
    return `next decision: review /ops preview job_id:${waitingApproval.job_id}, then /ops approve or /ops cancel`;
  }

  const waitingWorker = jobs.find((job) => job.status === "WaitingWorker");
  if (waitingWorker) {
    return `next decision: check worker, then /ops recover job_id:${waitingWorker.job_id} if the lease expired`;
  }

  const running = jobs.find((job) => job.status === "Running");
  if (running) {
    return `next decision: wait for worker heartbeat or inspect /ops logs job_id:${running.job_id}`;
  }

  const failed = jobs.find((job) => job.status === "Failed" || job.status === "FailedDuplicateWorker");
  if (failed) {
    return `next decision: inspect /ops logs job_id:${failed.job_id}`;
  }

  return "next decision: none";
}

export function buildBotOpsStatusReply(
  jobs: BotOpsJob[],
  heartbeats: BotOpsWorkerHeartbeatRecord[] = [],
): string {
  const running = jobs.filter((job) => job.status === "Running").length;
  const waitingApproval = jobs.filter((job) => job.status === "WaitingApproval").length;
  const waitingWorker = jobs.filter((job) => job.status === "WaitingWorker").length;
  const failed = jobs.filter((job) => job.status === "Failed" || job.status === "FailedDuplicateWorker").length;

  return [
    "**BotOps status**",
    "```text",
    "mode: staged approval",
    "arbitrary shell: disabled",
    "auto commit/push/deploy: disabled",
    `known jobs: ${jobs.length}`,
    `running: ${running}`,
    `waiting approval: ${waitingApproval}`,
    `waiting worker: ${waitingWorker}`,
    `failed: ${failed}`,
    formatBotOpsNextDecision(jobs),
    "",
    formatBotOpsWorkerHeartbeats(heartbeats),
    "```",
  ].join("\n");
}
