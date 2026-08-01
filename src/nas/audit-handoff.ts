import { isAuditCheckName, type AuditCheckName } from "../audit/check-catalog.js";
import { isAuditJobStatus, type AuditJobStatus } from "../audit/types.js";
import { sanitizePublicFileLabel } from "../utils/public-safety.js";
import {
  createHandoffEnvelope,
  type HandoffEnvelope,
} from "./handoff-store.js";

export interface AuditRequestHandoffInput {
  requestId?: string;
  projectLabel: string;
  checkName: string;
}

export interface AuditStatusHandoffInput {
  jobId: string;
  projectLabel: string;
  checkName: AuditCheckName;
  status: AuditJobStatus;
  currentStep: string | null;
}

export function createAuditRequestHandoff(
  input: AuditRequestHandoffInput,
  now = new Date(),
): HandoffEnvelope {
  if (!isAuditCheckName(input.checkName)) {
    throw new Error("Unsupported audit check for NAS handoff.");
  }

  const projectLabel = sanitizePublicFileLabel(input.projectLabel);
  return createHandoffEnvelope({
    id: input.requestId,
    type: "audit.request",
    source: "discord-control",
    target: "pc-worker",
    status: "queued",
    publicSummary: `Audit request check=${input.checkName} project=${projectLabel} mode=check-only`,
    publicFields: {
      check: input.checkName,
      mode: "check-only",
      project: projectLabel,
    },
  }, now);
}

export function createAuditStatusHandoff(
  input: AuditStatusHandoffInput,
  now = new Date(),
): HandoffEnvelope {
  if (!isAuditJobStatus(input.status)) {
    throw new Error("Unsupported audit status for NAS handoff.");
  }

  const projectLabel = sanitizePublicFileLabel(input.projectLabel);
  const currentStep = input.currentStep ?? "none";
  const publicJobId = input.jobId.slice(0, 8);
  return createHandoffEnvelope({
    id: `audit-status-${publicJobId}`,
    type: "audit.status",
    source: "pc-worker",
    target: "nas-control-plane",
    status: input.status === "completed" ? "completed" : "accepted",
    publicSummary: `Audit status job=${publicJobId} status=${input.status} step=${currentStep}`,
    publicFields: {
      check: input.checkName,
      job: publicJobId,
      project: projectLabel,
      status: input.status,
      step: currentStep,
    },
  }, now);
}
