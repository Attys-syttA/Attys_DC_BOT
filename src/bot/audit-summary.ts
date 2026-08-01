import type { AuditJobRecord, AuditStepRecord } from "../db/types.js";

const ACTIVE_AUDIT_STATUSES = new Set(["queued", "planning", "running_checks", "waiting_nas_result"]);

function shortJobId(job: AuditJobRecord): string {
  return `${job.id.slice(0, 8)}...`;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${durationMs}ms`;
  const seconds = Math.round(durationMs / 1_000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function countSteps(steps: AuditStepRecord[]): string {
  if (steps.length === 0) return "steps:0";
  const counts = new Map<string, number>();
  for (const step of steps) {
    counts.set(step.status, (counts.get(step.status) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `${status}:${count}`)
    .join(" ");
}

export function describeAuditDashboard(job: AuditJobRecord | undefined, steps: AuditStepRecord[]): string {
  if (!job) return "none";
  const latestStep = steps.at(-1);
  const totalDurationMs = steps.reduce((sum, step) => sum + Math.max(0, step.duration_ms), 0);
  return [
    `Job: \`${shortJobId(job)}\``,
    `Status: **${job.status}**${ACTIVE_AUDIT_STATUSES.has(job.status) ? " (active)" : ""}`,
    `Current step: **${job.current_step ?? "none"}**`,
    `Stop requested: **${job.stop_requested ? "yes" : "no"}**`,
    latestStep ? `Latest step: **${latestStep.step_name} ${latestStep.status}**` : "Latest step: none",
    `Progress: **${countSteps(steps)}**`,
    totalDurationMs > 0 ? `Runtime: **${formatDuration(totalDurationMs)}**` : "Runtime: none",
  ].join("\n");
}

export function describeAuditInline(job: AuditJobRecord | undefined, steps: AuditStepRecord[]): string {
  if (!job) return "none";
  const latestStep = steps.at(-1);
  const stop = job.stop_requested ? " stop-requested" : "";
  const latest = latestStep ? ` ${latestStep.step_name}:${latestStep.status}` : "";
  return `${job.status}${stop}${latest} ${countSteps(steps)}`.trim();
}
