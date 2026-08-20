import { randomUUID } from "node:crypto";
import { z } from "zod";

export const BOTOPS_CAPABILITIES = [
  "status.read",
  "audit.check",
  "audit.repair.prepare",
  "audit.repair.run",
  "audit.repair.apply",
  "git.commit",
  "git.push",
  "service.restart",
  "nas.worker.check",
  "nas.deploy.verify",
  "nas.deploy.apply",
] as const;

export type BotOpsCapability = typeof BOTOPS_CAPABILITIES[number];

export const BOTOPS_JOB_STATUSES = [
  "Requested",
  "Accepted",
  "Running",
  "WaitingApproval",
  "Completed",
  "Failed",
  "WaitingManualReview",
  "Cancelled",
  "WaitingWorker",
  "FailedDuplicateWorker",
] as const;

export type BotOpsJobStatus = typeof BOTOPS_JOB_STATUSES[number];

export const BOTOPS_APPROVAL_STATES = [
  "not_required",
  "required",
  "approved",
  "rejected",
  "stale",
] as const;

export type BotOpsApprovalState = typeof BOTOPS_APPROVAL_STATES[number];

export const BOTOPS_TARGETS = [
  "discord",
  "nas",
  "windows",
  "repo",
] as const;

export type BotOpsTarget = typeof BOTOPS_TARGETS[number];

const approvalRequiredCapabilities = new Set<BotOpsCapability>([
  "audit.repair.apply",
  "git.commit",
  "git.push",
  "service.restart",
  "nas.deploy.verify",
  "nas.deploy.apply",
]);

const defaultApprovalMetadata: Record<BotOpsCapability, {
  expected_action: string;
  validation_condition: string;
}> = {
  "status.read": {
    expected_action: "read public-safe worker status",
    validation_condition: "worker reports a public-safe status result",
  },
  "audit.check": {
    expected_action: "run one fixed named audit check",
    validation_condition: "named check exits with a recorded public-safe result",
  },
  "audit.repair.prepare": {
    expected_action: "prepare an isolated repair workspace",
    validation_condition: "repair workspace is recorded without changing the source worktree",
  },
  "audit.repair.run": {
    expected_action: "start one isolated Codex repair turn",
    validation_condition: "repair execution is recorded for manual review",
  },
  "audit.repair.apply": {
    expected_action: "apply a reviewed passing repair diff to the source worktree",
    validation_condition: "the original named check passes again in the source worktree",
  },
  "git.commit": {
    expected_action: "commit already staged source changes",
    validation_condition: "commit succeeds after diff-check and secret scan",
  },
  "git.push": {
    expected_action: "fetch remote refs and push the current clean branch to its upstream",
    validation_condition: "fetch succeeds, branch is not behind upstream, and push succeeds without force or rebase",
  },
  "service.restart": {
    expected_action: "restart the fixed Windows bot service helper",
    validation_condition: "bot health and command registration remain valid after restart",
  },
  "nas.worker.check": {
    expected_action: "run a fixed NAS worker health check",
    validation_condition: "NAS worker records a public-safe status result",
  },
  "nas.deploy.verify": {
    expected_action: "run the read-only NAS deploy verifier",
    validation_condition: "NAS deploy verifier reports the expected build identity and health",
  },
  "nas.deploy.apply": {
    expected_action: "run the fixed NAS deploy apply helper and post-deploy verifier",
    validation_condition: "deploy apply exits successfully and NAS deploy verifier passes afterwards",
  },
};

export const botOpsJobRequestSchema = z.object({
  job_id: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9._:-]+$/).optional(),
  requested_by: z.string().trim().min(1).max(80),
  target: z.enum(BOTOPS_TARGETS),
  capability: z.enum(BOTOPS_CAPABILITIES),
  summary: z.string().trim().min(1).max(300),
  payload_json: z.string().trim().max(2_000).optional(),
  expected_action: z.string().trim().min(1).max(300).optional(),
  validation_condition: z.string().trim().min(1).max(300).optional(),
  created_at: z.string().datetime().optional(),
});

export const botOpsJobSchema = botOpsJobRequestSchema.extend({
  job_id: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9._:-]+$/),
  created_at: z.string().datetime(),
  payload_json: z.string().trim().max(2_000),
  status: z.enum(BOTOPS_JOB_STATUSES),
  approval_state: z.enum(BOTOPS_APPROVAL_STATES),
  approved_by: z.string().trim().max(80).nullable(),
  approval_expires_at: z.string().datetime().nullable(),
  lease_owner: z.string().trim().max(120).nullable(),
  lease_expires_at: z.string().datetime().nullable(),
  heartbeat_at: z.string().datetime().nullable(),
  logs: z.string().trim().max(2_000),
  result: z.string().trim().max(2_000),
  expected_action: z.string().trim().min(1).max(300),
  validation_condition: z.string().trim().min(1).max(300),
  updated_at: z.string().datetime(),
});

export const botOpsApprovalSchema = z.object({
  approval_id: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9._:-]+$/),
  job_id: z.string().trim().min(1).max(80),
  approved_by: z.string().trim().min(1).max(80),
  target: z.enum(BOTOPS_TARGETS),
  capability: z.enum(BOTOPS_CAPABILITIES),
  state: z.enum(["approved", "rejected"]),
  expected_action: z.string().trim().min(1).max(300),
  validation: z.string().trim().min(1).max(300),
  expires_at: z.string().datetime(),
  created_at: z.string().datetime(),
});

export type BotOpsJobRequest = z.infer<typeof botOpsJobRequestSchema>;
export type BotOpsJob = z.infer<typeof botOpsJobSchema>;
export type BotOpsApproval = z.infer<typeof botOpsApprovalSchema>;

export function isBotOpsCapability(value: string): value is BotOpsCapability {
  return (BOTOPS_CAPABILITIES as readonly string[]).includes(value);
}

export function capabilityRequiresApproval(capability: BotOpsCapability): boolean {
  return approvalRequiredCapabilities.has(capability);
}

export function defaultBotOpsApprovalMetadata(capability: BotOpsCapability): {
  expected_action: string;
  validation_condition: string;
} {
  return defaultApprovalMetadata[capability];
}

export function createBotOpsJob(
  request: BotOpsJobRequest,
  now = new Date(),
): BotOpsJob {
  const parsed = botOpsJobRequestSchema.parse(request);
  const createdAt = parsed.created_at ?? now.toISOString();
  const approvalRequired = capabilityRequiresApproval(parsed.capability);
  const metadata = defaultBotOpsApprovalMetadata(parsed.capability);
  return botOpsJobSchema.parse({
    ...parsed,
    job_id: parsed.job_id ?? `job-${randomUUID()}`,
    created_at: createdAt,
    payload_json: parsed.payload_json ?? "",
    expected_action: parsed.expected_action ?? metadata.expected_action,
    validation_condition: parsed.validation_condition ?? metadata.validation_condition,
    status: approvalRequired ? "WaitingApproval" : "Requested",
    approval_state: approvalRequired ? "required" : "not_required",
    approved_by: null,
    approval_expires_at: null,
    lease_owner: null,
    lease_expires_at: null,
    heartbeat_at: null,
    logs: "",
    result: "",
    updated_at: createdAt,
  });
}

export function isLeaseExpired(
  job: Pick<BotOpsJob, "lease_expires_at">,
  now = new Date(),
): boolean {
  if (!job.lease_expires_at) return false;
  return Date.parse(job.lease_expires_at) <= now.getTime();
}

export function approvalMatchesJob(
  job: Pick<BotOpsJob, "job_id" | "target" | "capability"> & Partial<Pick<BotOpsJob, "expected_action" | "validation_condition">>,
  approval: Pick<BotOpsApproval, "job_id" | "target" | "capability" | "state" | "expires_at"> & Partial<Pick<BotOpsApproval, "expected_action" | "validation">>,
  now = new Date(),
): boolean {
  if (approval.state !== "approved") return false;
  if (approval.job_id !== job.job_id) return false;
  if (approval.target !== job.target) return false;
  if (approval.capability !== job.capability) return false;
  if (job.expected_action && approval.expected_action && approval.expected_action !== job.expected_action) return false;
  if (job.validation_condition && approval.validation && approval.validation !== job.validation_condition) return false;
  return Date.parse(approval.expires_at) > now.getTime();
}
