import type { AuditRepairWorktreeRecord, AuditJobRecord, AuditStepRecord } from "../db/types.js";
import { buildAuditRepairContract } from "./repair-contract.js";

export interface AuditRepairPlanInput {
  job: AuditJobRecord;
  steps: AuditStepRecord[];
  repairWorktree?: AuditRepairWorktreeRecord;
  repairChangeSummary: string;
}

export function renderAuditRepairPlan(input: AuditRepairPlanInput): string {
  const contract = buildAuditRepairContract(input);

  const lines = [
    "repair contract: preview only",
    `version: ${contract.version}`,
    `job: \`${contract.jobId}\``,
    `project: \`${contract.projectLabel}\``,
    `status: ${contract.status}`,
    `target check: ${contract.targetCheck}`,
    `iteration budget: ${contract.iteration}/${contract.maxIterations}`,
    `latest evidence: ${contract.latestEvidence ? `${contract.latestEvidence.stepName}:${contract.latestEvidence.status}` : "none"}`,
    `evidence summary: ${contract.latestEvidence ? contract.latestEvidence.summary : "none"}`,
    `repair workspace: ${contract.repairWorkspace.status}`,
    `repair changes: ${contract.repairWorkspace.changeSummary}`,
    `allowed repair scope: ${contract.allowedScope}`,
    `allowed capabilities: ${contract.allowedCapabilities.join(", ")}`,
    `required validation: ${contract.requiredValidation}`,
    `blocked actions: ${contract.blockedActions.join(", ")}`,
    `operator decision: ${contract.operatorDecision}`,
  ];

  if (contract.repairWorkspace.branchName && contract.repairWorkspace.headCommit) {
    lines.splice(11, 0,
      `repair branch: ${contract.repairWorkspace.branchName}`,
      `repair head: ${contract.repairWorkspace.headCommit}`,
    );
  }

  return lines.join("\n");
}
