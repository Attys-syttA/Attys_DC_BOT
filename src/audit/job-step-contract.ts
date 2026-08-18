import type { AuditJobRecord, AuditStepRecord } from "../db/types.js";
import { sanitizePublicFileLabel } from "../utils/public-safety.js";
import {
  isAuditCapability,
  isAuditJobStatus,
  isAuditMode,
  type AuditCapabilityGrant,
} from "./types.js";

export const AUDIT_JOB_STEP_CONTRACT_VERSION = "audit-job-step-contract/v1";

export interface AuditJobStepSummary {
  id: string;
  name: string;
  status: string;
  exitCode: number | null;
  timedOut: boolean;
  stopped: boolean;
  durationMs: number;
  outputSummary: string;
  startedAt: string;
  finishedAt: string;
}

export interface AuditJobStepContract {
  version: typeof AUDIT_JOB_STEP_CONTRACT_VERSION;
  jobId: string;
  projectLabel: string;
  mode: string;
  status: string;
  requestedCheck: string | null;
  currentStep: string | null;
  iteration: number;
  maxIterations: number;
  stopRequested: boolean;
  capabilities: AuditCapabilityGrant[];
  steps: AuditJobStepSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface AuditJobStepContractInput {
  job: AuditJobRecord;
  steps: AuditStepRecord[];
}

const MAX_OUTPUT_SUMMARY_LENGTH = 240;

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

function parseCapabilities(capabilitiesJson: string): AuditCapabilityGrant[] {
  const parsed: unknown = JSON.parse(capabilitiesJson);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item) => {
    if (
      typeof item === "object"
      && item !== null
      && "capability" in item
      && "approved" in item
      && typeof item.capability === "string"
      && isAuditCapability(item.capability)
      && typeof item.approved === "boolean"
    ) {
      return [{ capability: item.capability, approved: item.approved }];
    }
    return [];
  });
}

export function buildAuditJobStepContract(input: AuditJobStepContractInput): AuditJobStepContract {
  return {
    version: AUDIT_JOB_STEP_CONTRACT_VERSION,
    jobId: input.job.id,
    projectLabel: sanitizePublicFileLabel(input.job.project_label),
    mode: input.job.mode,
    status: input.job.status,
    requestedCheck: input.job.requested_check,
    currentStep: input.job.current_step,
    iteration: input.job.iteration,
    maxIterations: input.job.max_iterations,
    stopRequested: input.job.stop_requested === 1,
    capabilities: parseCapabilities(input.job.capabilities_json),
    steps: input.steps.map((step) => ({
      id: step.id,
      name: step.step_name,
      status: step.status,
      exitCode: step.exit_code,
      timedOut: step.timed_out === 1,
      stopped: step.stopped === 1,
      durationMs: step.duration_ms,
      outputSummary: summarizePublicOutput(step.public_output),
      startedAt: step.started_at,
      finishedAt: step.finished_at,
    })),
    createdAt: input.job.created_at,
    updatedAt: input.job.updated_at,
  };
}

export function validateAuditJobStepContract(
  contract: AuditJobStepContract,
  source?: AuditJobStepContractInput,
): string[] {
  const issues: string[] = [];
  if (contract.version !== AUDIT_JOB_STEP_CONTRACT_VERSION) {
    issues.push("unsupported audit job step contract version");
  }
  if (!isAuditMode(contract.mode)) {
    issues.push("unsupported audit mode");
  }
  if (!isAuditJobStatus(contract.status)) {
    issues.push("unsupported audit job status");
  }
  if (!Number.isInteger(contract.iteration) || contract.iteration < 0) {
    issues.push("audit iteration is invalid");
  }
  if (!Number.isInteger(contract.maxIterations) || contract.maxIterations < 1) {
    issues.push("audit max iterations is invalid");
  }
  if (contract.iteration > contract.maxIterations) {
    issues.push("audit iteration exceeds max iterations");
  }
  for (const grant of contract.capabilities) {
    if (!isAuditCapability(grant.capability)) {
      issues.push(`unsupported audit capability: ${grant.capability}`);
    }
  }
  if (source) {
    if (contract.jobId !== source.job.id) {
      issues.push("audit job id drift");
    }
    if (contract.steps.length !== source.steps.length) {
      issues.push("audit step count drift");
    }
    source.steps.forEach((step, index) => {
      if (contract.steps[index]?.id !== step.id) {
        issues.push(`audit step drift at index ${index}`);
      }
    });
  }
  return issues;
}
