import type { AuditRepairWorktreeRecord, AuditJobRecord, AuditStepRecord } from "../db/types.js";
import { sanitizePublicFileLabel } from "../utils/public-safety.js";

const MAX_OUTPUT_SUMMARY_LENGTH = 240;

export interface AuditRepairPlanInput {
  job: AuditJobRecord;
  steps: AuditStepRecord[];
  repairWorktree?: AuditRepairWorktreeRecord;
  repairChangeSummary: string;
}

function shortId(id: string): string {
  return `${id.slice(0, 8)}...`;
}

function latestRelevantStep(steps: AuditStepRecord[]): AuditStepRecord | undefined {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    if (steps[index].status !== "passed") return steps[index];
  }
  return steps.at(-1);
}

function summarizePublicOutput(output: string): string {
  const normalized = output
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/`/g, "'");

  if (!normalized) return "none";
  if (normalized.length <= MAX_OUTPUT_SUMMARY_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_OUTPUT_SUMMARY_LENGTH - 3)}...`;
}

export function renderAuditRepairPlan(input: AuditRepairPlanInput): string {
  const latestStep = latestRelevantStep(input.steps);
  const workspaceStatus = input.repairWorktree
    ? input.repairWorktree.status
    : "missing; approve /audit repair first";

  const lines = [
    "repair contract: preview only",
    `job: \`${shortId(input.job.id)}\``,
    `project: \`${sanitizePublicFileLabel(input.job.project_label)}\``,
    `status: ${input.job.status}`,
    `target check: ${input.job.requested_check ?? "unknown"}`,
    `iteration budget: ${input.job.iteration}/${input.job.max_iterations}`,
    `latest evidence: ${latestStep ? `${latestStep.step_name}:${latestStep.status}` : "none"}`,
    `evidence summary: ${latestStep ? summarizePublicOutput(latestStep.public_output) : "none"}`,
    `repair workspace: ${workspaceStatus}`,
    `repair changes: ${input.repairChangeSummary}`,
    "allowed repair scope: isolated repair worktree only",
    "allowed capabilities: read context, edit existing files, create/delete only inside the repair workspace when needed",
    "required validation: rerun the original named check through /audit recheck",
    "blocked actions: source worktree write, automatic merge, commit, push, dependency install, deploy, arbitrary shell",
    "operator decision: review this contract before any future Codex repair execution",
  ];

  if (input.repairWorktree) {
    lines.splice(10, 0,
      `repair branch: ${input.repairWorktree.branch_name}`,
      `repair head: ${input.repairWorktree.head_commit.slice(0, 12)}`,
    );
  }

  return lines.join("\n");
}
