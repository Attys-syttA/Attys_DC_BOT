import type { AuditRepairContract } from "./repair-contract.js";
import { validateAuditRepairContract } from "./repair-contract.js";
import { validateAuditRepairPrompt } from "./repair-prompt.js";

export type AuditRepairExecutionStatus = "disabled" | "rejected" | "started";

export interface AuditRepairStartResult {
  threadId: string;
  turnId: string | null;
}

export interface AuditRepairExecutorInput {
  enabled: boolean;
  worktreePath: string | null;
  contract: AuditRepairContract;
  prompt: string;
  startCodexRepair?: (worktreePath: string, prompt: string) => Promise<AuditRepairStartResult>;
}

export interface AuditRepairExecutorResult {
  status: AuditRepairExecutionStatus;
  summary: string;
  threadId: string | null;
  turnId: string | null;
  issues: string[];
}

function rejected(summary: string, issues: string[]): AuditRepairExecutorResult {
  return {
    status: "rejected",
    summary,
    threadId: null,
    turnId: null,
    issues,
  };
}

export async function startAuditRepairExecution(input: AuditRepairExecutorInput): Promise<AuditRepairExecutorResult> {
  if (!input.enabled) {
    return {
      status: "disabled",
      summary: "audit repair execution disabled",
      threadId: null,
      turnId: null,
      issues: [],
    };
  }

  if (!input.worktreePath) {
    return rejected("repair workspace missing", ["repair execution requires an isolated worktree path"]);
  }

  const contractIssues = validateAuditRepairContract(input.contract);
  if (contractIssues.length > 0) {
    return rejected("repair contract invalid", contractIssues);
  }

  const promptIssues = validateAuditRepairPrompt(input.prompt, input.contract);
  if (promptIssues.length > 0) {
    return rejected("repair prompt invalid", promptIssues);
  }

  if (!input.startCodexRepair) {
    return rejected("repair executor not configured", ["startCodexRepair callback missing"]);
  }

  const started = await input.startCodexRepair(input.worktreePath, input.prompt);
  return {
    status: "started",
    summary: "repair Codex turn started in isolated worktree",
    threadId: started.threadId,
    turnId: started.turnId,
    issues: [],
  };
}
