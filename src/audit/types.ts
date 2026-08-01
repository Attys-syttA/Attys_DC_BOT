import { sanitizePublicFileLabel } from "../utils/public-safety.js";

export const AUDIT_MODES = ["check-only", "approved-repair"] as const;
export type AuditMode = typeof AUDIT_MODES[number];

export const AUDIT_JOB_STATUSES = [
  "queued",
  "planning",
  "running_checks",
  "waiting_nas_result",
  "waiting_repair_approval",
  "preparing_isolated_worktree",
  "repairing",
  "rechecking",
  "waiting_manual_review",
  "completed",
  "failed",
  "stagnated",
  "stopped",
] as const;

export type AuditJobStatus = typeof AUDIT_JOB_STATUSES[number];

export const AUDIT_CAPABILITIES = [
  "read-context",
  "edit-existing",
  "create-delete",
] as const;

export type AuditCapability = typeof AUDIT_CAPABILITIES[number];

export interface AuditCapabilityGrant {
  capability: AuditCapability;
  approved: boolean;
}

export interface AuditJobSummary {
  id: string;
  channelId: string;
  projectLabel: string;
  mode: AuditMode;
  status: AuditJobStatus;
  currentStep: string | null;
  iteration: number;
  maxIterations: number;
  stopRequested: boolean;
  capabilities: AuditCapabilityGrant[];
  createdAt: string;
  updatedAt: string;
}

export interface PublicAuditJobSummary {
  id: string;
  projectLabel: string;
  mode: AuditMode;
  status: AuditJobStatus;
  currentStep: string | null;
  iteration: number;
  maxIterations: number;
  stopRequested: boolean;
  capabilities: AuditCapabilityGrant[];
  createdAt: string;
  updatedAt: string;
}

const TERMINAL_AUDIT_STATUSES = new Set<AuditJobStatus>([
  "completed",
  "failed",
  "stagnated",
  "stopped",
]);

const AUDIT_STATUS_TRANSITIONS: Readonly<Record<AuditJobStatus, readonly AuditJobStatus[]>> = {
  queued: ["planning", "stopped", "failed"],
  planning: ["running_checks", "stopped", "failed"],
  running_checks: ["completed", "waiting_repair_approval", "waiting_manual_review", "stopped", "failed"],
  waiting_nas_result: ["completed", "waiting_manual_review", "stopped", "failed"],
  waiting_repair_approval: ["preparing_isolated_worktree", "waiting_manual_review", "stopped", "failed"],
  preparing_isolated_worktree: ["repairing", "waiting_manual_review", "stopped", "failed"],
  repairing: ["rechecking", "stopped", "failed"],
  rechecking: ["completed", "repairing", "stagnated", "waiting_manual_review", "stopped", "failed"],
  waiting_manual_review: ["rechecking", "stopped"],
  completed: [],
  failed: [],
  stagnated: [],
  stopped: [],
};

export function isAuditMode(value: string): value is AuditMode {
  return AUDIT_MODES.includes(value as AuditMode);
}

export function isAuditJobStatus(value: string): value is AuditJobStatus {
  return AUDIT_JOB_STATUSES.includes(value as AuditJobStatus);
}

export function isAuditCapability(value: string): value is AuditCapability {
  return AUDIT_CAPABILITIES.includes(value as AuditCapability);
}

export function isTerminalAuditStatus(status: AuditJobStatus): boolean {
  return TERMINAL_AUDIT_STATUSES.has(status);
}

export function canTransitionAuditStatus(from: AuditJobStatus, to: AuditJobStatus): boolean {
  return AUDIT_STATUS_TRANSITIONS[from].includes(to);
}

export function defaultAuditCapabilities(mode: AuditMode): AuditCapabilityGrant[] {
  return AUDIT_CAPABILITIES.map((capability) => ({
    capability,
    approved: capability === "read-context" && mode === "check-only",
  }));
}

export function assertAuditModeAllowsCapabilities(
  mode: AuditMode,
  capabilities: AuditCapabilityGrant[],
): void {
  const approved = new Set(
    capabilities
      .filter((grant) => grant.approved)
      .map((grant) => grant.capability),
  );

  if (mode === "check-only" && (approved.has("edit-existing") || approved.has("create-delete"))) {
    throw new Error("check-only audit cannot approve write capabilities");
  }

  if (approved.has("create-delete") && !approved.has("edit-existing")) {
    throw new Error("create-delete capability requires edit-existing approval");
  }
}

export function buildPublicAuditJobSummary(summary: AuditJobSummary): PublicAuditJobSummary {
  return {
    id: summary.id,
    projectLabel: sanitizePublicFileLabel(summary.projectLabel),
    mode: summary.mode,
    status: summary.status,
    currentStep: summary.currentStep,
    iteration: summary.iteration,
    maxIterations: summary.maxIterations,
    stopRequested: summary.stopRequested,
    capabilities: summary.capabilities.map((grant) => ({ ...grant })),
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
  };
}
