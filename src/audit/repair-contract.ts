import type { AuditRepairWorktreeRecord, AuditJobRecord, AuditStepRecord } from "../db/types.js";
import { sanitizePublicFileLabel } from "../utils/public-safety.js";

export const AUDIT_REPAIR_CONTRACT_VERSION = "audit-repair-contract/v2";

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

export type AuditRepairRoleName = "planner" | "executor" | "validator";

export interface AuditRepairRolePhase {
  role: AuditRepairRoleName;
  responsibility: string;
  handoff: string;
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
  rolePhases: AuditRepairRolePhase[];
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
];
const ROLE_PHASES: AuditRepairRolePhase[] = [
  {
    role: "planner",
    responsibility: "derive the smallest isolated repair plan from the stored audit evidence before editing",
    handoff: "state the intended files by public-safe label and the target check being repaired",
  },
  {
    role: "executor",
    responsibility: "make only the minimal repair inside the isolated repair worktree",
    handoff: "summarize changed file labels and any residual implementation risk",
  },
  {
    role: "validator",
    responsibility: "self-check scope, blocked actions, and expected validation without running the orchestrator-owned recheck",
    handoff: "leave final validation to /audit recheck and report any reason it may fail",
  },
] as const;
const REQUIRED_ROLE_PHASES: AuditRepairRoleName[] = ["planner", "executor", "validator"];

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
    rolePhases: [...ROLE_PHASES],
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
  if (!contract.latestEvidence || contract.latestEvidence.status === "passed") {
    issues.push("repair contract has no non-passed audit evidence");
  }
  if (contract.repairWorkspace.status !== "prepared" && contract.repairWorkspace.status !== "retained") {
    issues.push("repair contract has no prepared repair workspace");
  }
  if (contract.allowedScope !== "isolated repair worktree only") {
    issues.push("repair contract scope is not isolated");
  }
  const roleNames = contract.rolePhases.map((phase) => phase.role);
  for (const role of REQUIRED_ROLE_PHASES) {
    if (!roleNames.includes(role)) {
      issues.push(`repair contract missing ${role} role phase`);
    }
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
