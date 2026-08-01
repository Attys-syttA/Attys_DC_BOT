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

export type NasHandoffRequestStatus = "queued" | "completed" | "failed";
export type NasHandoffRequestStatusFilter = NasHandoffRequestStatus | "all";

export interface NasHandoffRequestRecord {
  id: string;
  channel_id: string;
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
