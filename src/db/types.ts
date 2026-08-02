import type { AuditCapabilityGrant, AuditJobStatus, AuditMode } from "../audit/types.js";
import type { AuditCheckRunResult } from "../audit/check-runner.js";

export type SessionStatus = "online" | "offline" | "waiting" | "idle";

export interface Project {
  channel_id: string;
  project_path: string;
  guild_id: string;
  auto_approve: number;
  created_at: string;
}

export interface Session {
  id: string;
  channel_id: string;
  session_id: string | null; // Codex thread ID
  status: SessionStatus;
  last_activity: string | null;
  created_at: string;
}

export interface AuditJobRecord {
  id: string;
  channel_id: string;
  project_label: string;
  mode: AuditMode;
  status: AuditJobStatus;
  requested_check: string | null;
  current_step: string | null;
  iteration: number;
  max_iterations: number;
  stop_requested: number;
  capabilities_json: string;
  created_at: string;
  updated_at: string;
}

export interface AuditJobCreateInput {
  id: string;
  channelId: string;
  projectLabel: string;
  mode: AuditMode;
  status: AuditJobStatus;
  requestedCheck?: string | null;
  currentStep: string | null;
  iteration: number;
  maxIterations: number;
  stopRequested: boolean;
  capabilities: AuditCapabilityGrant[];
  createdAt: string;
  updatedAt: string;
}

export interface AuditStepRecord {
  id: string;
  job_id: string;
  step_name: AuditCheckRunResult["name"];
  status: AuditCheckRunResult["status"];
  exit_code: number | null;
  timed_out: number;
  stopped: number;
  public_output: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  created_at: string;
}

export type AuditRepairWorktreeStatus = "prepared" | "retained" | "cleanup_failed" | "removed";

export interface AuditRepairWorktreeRecord {
  job_id: string;
  worktree_path: string;
  branch_name: string;
  head_commit: string;
  status: AuditRepairWorktreeStatus;
  created_at: string;
  updated_at: string;
}

export interface AuditRepairWorktreeCreateInput {
  jobId: string;
  worktreePath: string;
  branchName: string;
  headCommit: string;
  status: AuditRepairWorktreeStatus;
  createdAt: string;
  updatedAt: string;
}

export type AuditRepairExecutionStatus = "starting" | "started" | "reviewed" | "failed";

export interface AuditRepairExecutionRecord {
  id: string;
  job_id: string;
  status: AuditRepairExecutionStatus;
  iteration: number;
  thread_id: string | null;
  turn_id: string | null;
  result_summary: string;
  created_at: string;
  updated_at: string;
}

export interface AuditRepairExecutionCreateInput {
  id: string;
  jobId: string;
  status: AuditRepairExecutionStatus;
  iteration: number;
  threadId: string | null;
  turnId: string | null;
  resultSummary: string;
  createdAt: string;
  updatedAt: string;
}

export type NasHandoffRequestStatus = "queued" | "completed" | "failed";
export type NasHandoffRequestStatusFilter = NasHandoffRequestStatus | "all";

export interface NasHandoffRequestRecord {
  id: string;
  channel_id: string;
  audit_job_id: string | null;
  project_label: string;
  check_name: string;
  status: NasHandoffRequestStatus;
  result_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface NasHandoffRequestCreateInput {
  id: string;
  channelId: string;
  auditJobId?: string | null;
  projectLabel: string;
  checkName: string;
  status: NasHandoffRequestStatus;
  resultSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NasHandoffRequestStatusCounts {
  queued: number;
  completed: number;
  failed: number;
}
