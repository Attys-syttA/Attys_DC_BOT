import type { AuditRepairContract } from "./repair-contract.js";
import { validateAuditRepairContract } from "./repair-contract.js";

export function buildAuditRepairPrompt(contract: AuditRepairContract): string {
  const contractIssues = validateAuditRepairContract(contract);
  if (contractIssues.length > 0) {
    throw new Error(`invalid audit repair contract: ${contractIssues.join("; ")}`);
  }

  return [
    "You are preparing one bounded repair attempt for an Attys_DC_BOT audit job.",
    `Contract version: ${contract.version}`,
    `Job: ${contract.jobId}`,
    `Project: ${contract.projectLabel}`,
    `Target check: ${contract.targetCheck}`,
    `Latest evidence: ${contract.latestEvidence ? `${contract.latestEvidence.stepName}:${contract.latestEvidence.status}` : "none"}`,
    `Evidence summary: ${contract.latestEvidence ? contract.latestEvidence.summary : "none"}`,
    `Repair workspace status: ${contract.repairWorkspace.status}`,
    `Repair workspace changes before work: ${contract.repairWorkspace.changeSummary}`,
    "",
    "Allowed scope:",
    `- ${contract.allowedScope}`,
    "",
    "Allowed capabilities:",
    ...contract.allowedCapabilities.map((capability) => `- ${capability}`),
    "",
    "Role phases in this single repair turn:",
    ...contract.rolePhases.map((phase) => `- ${phase.role}: ${phase.responsibility}; handoff: ${phase.handoff}`),
    "",
    "Hard blocks:",
    ...contract.blockedActions.map((action) => `- Do not ${action}.`),
    "",
    "Execution rules:",
    "- Work only in the current isolated repair worktree.",
    "- Do not alter the original/source worktree.",
    "- Do not install dependencies, deploy, merge, commit, push, or run arbitrary shell commands.",
    "- Make the smallest coherent code or documentation change needed for the target check.",
    "- Leave validation to the orchestrator; it will run /audit recheck.",
    "- Return a concise summary of intended changes, residual risk, and files touched by label only.",
  ].join("\n");
}

export function validateAuditRepairPrompt(prompt: string, contract: AuditRepairContract): string[] {
  const issues: string[] = [];
  const requiredSnippets = [
    contract.version,
    contract.targetCheck,
    contract.allowedScope,
    "Role phases in this single repair turn:",
    "planner:",
    "executor:",
    "validator:",
    "Do not alter the original/source worktree.",
    "Do not install dependencies, deploy, merge, commit, push, or run arbitrary shell commands.",
    "Leave validation to the orchestrator; it will run /audit recheck.",
  ];

  for (const snippet of requiredSnippets) {
    if (!prompt.includes(snippet)) {
      issues.push(`repair prompt missing required snippet: ${snippet}`);
    }
  }

  for (const action of contract.blockedActions) {
    if (!prompt.includes(`Do not ${action}.`)) {
      issues.push(`repair prompt does not block ${action}`);
    }
  }

  return issues;
}
