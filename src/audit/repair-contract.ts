import type { AuditRepairWorktreeRecord, AuditJobRecord, AuditStepRecord } from "../db/types.js";
import { sanitizePublicFileLabel } from "../utils/public-safety.js";

export const AUDIT_REPAIR_CONTRACT_VERSION = "audit-repair-contract/v1";

export interface AuditRepairEvidenceSummary {
  stepName: string;
  status: string;
  summary: string;
}

export interface AuditRepairWorkspaceSummary {
  status: string;
  branchName: string | null;
  headCommit: string | null;
  changeSummary: string;
}

export interface AuditRepairContract {
  version: typeof AUDIT_REPAIR_CONTRACT_VERSION;
  jobId: string;
  projectLabel: string;
  status: string;
  targetCheck: string;
  iteration: number;
  maxIterations: number;
  latestEvidence: AuditRepairEvidenceSummary | null;
  repairWorkspace: AuditRepairWorkspaceSummary;
  allowedScope: string;
  allowedCapabilities: string[];
  requiredValidation: string;
  blockedActions: string[];
  operatorDecision: string;
}

export interface AuditRepairContractInput {
  job: AuditJobRecord;
  steps: AuditStepRecord[];
  repairWorktree?: AuditRepairWorktreeRecord;
  repairChangeSummary: string;
}

const MAX_OUTPUT_SUMMARY_LENGTH = 240;
const BLOCKED_ACTIONS = [
  "source worktree write",
  "automatic merge",
  "commit",
  "push",
  "dependency install",
  "deploy",
  "arbitrary shell",
] as const;

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

export function buildAuditRepairContract(input: AuditRepairContractInput): AuditRepairContract {
  const latestStep = latestRelevantStep(input.steps);

  return {
    version: AUDIT_REPAIR_CONTRACT_VERSION,
    jobId: `${input.job.id.slice(0, 8)}...`,
    projectLabel: sanitizePublicFileLabel(input.job.project_label),
    status: input.job.status,
    targetCheck: input.job.requested_check ?? "unknown",
    iteration: input.job.iteration,
    maxIterations: input.job.max_iterations,
    latestEvidence: latestStep
      ? {
          stepName: latestStep.step_name,
          status: latestStep.status,
          summary: summarizePublicOutput(latestStep.public_output),
        }
      : null,
    repairWorkspace: input.repairWorktree
      ? {
          status: input.repairWorktree.status,
          branchName: input.repairWorktree.branch_name,
          headCommit: input.repairWorktree.head_commit.slice(0, 12),
          changeSummary: input.repairChangeSummary,
        }
      : {
          status: "missing; approve /audit repair first",
          branchName: null,
          headCommit: null,
          changeSummary: input.repairChangeSummary,
        },
    allowedScope: "isolated repair worktree only",
    allowedCapabilities: [
      "read context",
      "edit existing files",
      "create/delete only inside the repair workspace when needed",
    ],
    requiredValidation: "rerun the original named check through /audit recheck",
    blockedActions: [...BLOCKED_ACTIONS],
    operatorDecision: "review this contract before any future Codex repair execution",
  };
}

export function validateAuditRepairContract(contract: AuditRepairContract): string[] {
  const issues: string[] = [];
  if (contract.version !== AUDIT_REPAIR_CONTRACT_VERSION) {
    issues.push("unsupported repair contract version");
  }
  if (contract.allowedScope !== "isolated repair worktree only") {
    issues.push("repair contract scope is not isolated");
  }
  for (const action of BLOCKED_ACTIONS) {
    if (!contract.blockedActions.includes(action)) {
      issues.push(`repair contract does not block ${action}`);
    }
  }
  if (!contract.requiredValidation.includes("/audit recheck")) {
    issues.push("repair contract does not require isolated recheck validation");
  }
  return issues;
}
