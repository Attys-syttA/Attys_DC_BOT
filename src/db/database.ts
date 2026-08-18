import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { sanitizePublicFileLabel, sanitizePublicText } from "../utils/public-safety.js";
import type { AuditCheckRunResult } from "../audit/check-runner.js";
import { isTerminalAuditStatus, type AuditJobStatus } from "../audit/types.js";
import {
  createBotOpsJob,
  type BotOpsCapability,
  type BotOpsJob,
  type BotOpsJobRequest,
  type BotOpsJobStatus,
  type BotOpsTarget,
} from "../botops/contract.js";
import type {
  AuditJobCreateInput,
  AuditJobRecord,
  AuditRepairExecutionCreateInput,
  AuditRepairExecutionRecord,
  AuditRepairExecutionStatus,
  AuditRepairWorktreeCreateInput,
  AuditRepairWorktreeRecord,
  AuditRepairWorktreeStatus,
  AuditStepRecord,
  BotOpsEventRecord,
  BotOpsJobRecord,
  BotOpsWorkerHeartbeatRecord,
  NasHandoffRequestCreateInput,
  NasHandoffRequestRecord,
  NasHandoffRequestStatusFilter,
  NasHandoffRequestStatus,
  NasHandoffRequestStatusCounts,
  Project,
  Session,
  SessionStatus,
} from "./types.js";

let db: Database.Database;

export function initDatabase(): void {
  const configuredPath = process.env.DISCORD_DATABASE_PATH ?? ".discord-bot-state/bridge.sqlite";
  const dbPath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      channel_id TEXT PRIMARY KEY,
      project_path TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      auto_approve INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      channel_id TEXT REFERENCES projects(channel_id) ON DELETE CASCADE,
      session_id TEXT,
      status TEXT DEFAULT 'offline',
      last_activity TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_jobs (
      id TEXT PRIMARY KEY,
      channel_id TEXT REFERENCES projects(channel_id) ON DELETE CASCADE,
      project_label TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      requested_check TEXT,
      current_step TEXT,
      iteration INTEGER NOT NULL,
      max_iterations INTEGER NOT NULL,
      stop_requested INTEGER NOT NULL DEFAULT 0,
      capabilities_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_steps (
      id TEXT PRIMARY KEY,
      job_id TEXT REFERENCES audit_jobs(id) ON DELETE CASCADE,
      step_name TEXT NOT NULL,
      status TEXT NOT NULL,
      exit_code INTEGER,
      timed_out INTEGER NOT NULL,
      stopped INTEGER NOT NULL,
      public_output TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_repair_worktrees (
      job_id TEXT PRIMARY KEY REFERENCES audit_jobs(id) ON DELETE CASCADE,
      worktree_path TEXT NOT NULL,
      branch_name TEXT NOT NULL,
      head_commit TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_repair_executions (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES audit_jobs(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      iteration INTEGER NOT NULL DEFAULT 0,
      thread_id TEXT,
      turn_id TEXT,
      result_summary TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nas_handoff_requests (
      id TEXT PRIMARY KEY,
      channel_id TEXT REFERENCES projects(channel_id) ON DELETE CASCADE,
      audit_job_id TEXT,
      project_label TEXT NOT NULL,
      check_name TEXT NOT NULL,
      status TEXT NOT NULL,
      result_summary TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS botops_jobs (
      job_id TEXT PRIMARY KEY,
      requested_by TEXT NOT NULL,
      target TEXT NOT NULL,
      capability TEXT NOT NULL,
      status TEXT NOT NULL,
      approval_state TEXT NOT NULL,
      approved_by TEXT,
      approval_expires_at TEXT,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '',
      expected_action TEXT NOT NULL DEFAULT 'run the requested fixed helper',
      validation_condition TEXT NOT NULL DEFAULT 'worker records a public-safe result',
      lease_owner TEXT,
      lease_expires_at TEXT,
      heartbeat_at TEXT,
      logs TEXT NOT NULL DEFAULT '',
      result TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS botops_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS botops_worker_heartbeats (
      worker_id TEXT PRIMARY KEY,
      target TEXT NOT NULL,
      host TEXT NOT NULL,
      capabilities TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT NOT NULL,
      heartbeat_at TEXT NOT NULL
    );
  `);
  ensureColumn("audit_jobs", "requested_check", "TEXT");
  ensureColumn("audit_repair_executions", "iteration", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("nas_handoff_requests", "audit_job_id", "TEXT");
  ensureColumn("botops_jobs", "approved_by", "TEXT");
  ensureColumn("botops_jobs", "approval_expires_at", "TEXT");
  ensureColumn("botops_jobs", "payload_json", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("botops_jobs", "expected_action", "TEXT NOT NULL DEFAULT 'run the requested fixed helper'");
  ensureColumn("botops_jobs", "validation_condition", "TEXT NOT NULL DEFAULT 'worker records a public-safe result'");
  normalizeInterruptedAuditJobs();
}

export function getDb(): Database.Database {
  return db;
}

function ensureColumn(tableName: string, columnName: string, columnDefinition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
  if (columns.some((column) => column.name === columnName)) return;
  db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`).run();
}

// Project queries
export function registerProject(
  channelId: string,
  projectPath: string,
  guildId: string,
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO projects (channel_id, project_path, guild_id)
    VALUES (?, ?, ?)
  `);
  stmt.run(channelId, projectPath, guildId);
}

export function unregisterProject(channelId: string): void {
  db.prepare("DELETE FROM sessions WHERE channel_id = ?").run(channelId);
  db.prepare("DELETE FROM projects WHERE channel_id = ?").run(channelId);
}

export function getProject(channelId: string): Project | undefined {
  return db
    .prepare("SELECT * FROM projects WHERE channel_id = ?")
    .get(channelId) as Project | undefined;
}

export function getAllProjects(guildId: string): Project[] {
  return db
    .prepare("SELECT * FROM projects WHERE guild_id = ?")
    .all(guildId) as Project[];
}

export function getProjectsByPath(guildId: string, projectPath: string): Project[] {
  return db
    .prepare("SELECT * FROM projects WHERE guild_id = ? AND project_path = ?")
    .all(guildId, projectPath) as Project[];
}

export function setAutoApprove(
  channelId: string,
  autoApprove: boolean,
): void {
  db.prepare("UPDATE projects SET auto_approve = ? WHERE channel_id = ?").run(
    autoApprove ? 1 : 0,
    channelId,
  );
}

// Session queries
export function upsertSession(
  id: string,
  channelId: string,
  sessionId: string | null,
  status: SessionStatus,
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO sessions (id, channel_id, session_id, status, last_activity)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);
  stmt.run(id, channelId, sessionId, status);
}

export function getSession(channelId: string): Session | undefined {
  return db
    .prepare(
      "SELECT * FROM sessions WHERE channel_id = ? ORDER BY created_at DESC LIMIT 1",
    )
    .get(channelId) as Session | undefined;
}

export function updateSessionStatus(
  channelId: string,
  status: SessionStatus,
): void {
  db.prepare(
    "UPDATE sessions SET status = ?, last_activity = datetime('now') WHERE channel_id = ?",
  ).run(status, channelId);
}

export function getAllSessions(guildId: string): (Session & { project_path: string })[] {
  return db
    .prepare(`
      SELECT s.*, p.project_path FROM sessions s
      JOIN projects p ON s.channel_id = p.channel_id
      WHERE p.guild_id = ?
    `)
    .all(guildId) as (Session & { project_path: string })[];
}

function nowFromIso(value: string): Date {
  return new Date(value);
}

function botOpsJobFromRecord(record: BotOpsJobRecord): BotOpsJob {
  return {
    job_id: record.job_id,
    requested_by: record.requested_by,
    target: record.target as BotOpsJob["target"],
    capability: record.capability as BotOpsJob["capability"],
    status: record.status as BotOpsJob["status"],
    approval_state: record.approval_state as BotOpsJob["approval_state"],
    approved_by: record.approved_by,
    approval_expires_at: record.approval_expires_at,
    summary: record.summary,
    payload_json: record.payload_json,
    expected_action: record.expected_action,
    validation_condition: record.validation_condition,
    lease_owner: record.lease_owner,
    lease_expires_at: record.lease_expires_at,
    heartbeat_at: record.heartbeat_at,
    logs: record.logs,
    result: record.result,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

export function recordBotOpsEvent(
  jobId: string,
  eventType: string,
  actor: string,
  detail: string,
  now = new Date(),
): void {
  db.prepare(`
    INSERT INTO botops_events (job_id, event_type, actor, detail, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    sanitizePublicText(jobId, 120),
    sanitizePublicText(eventType, 80),
    sanitizePublicText(actor, 80),
    sanitizePublicText(detail, 300),
    now.toISOString(),
  );
}

export function listBotOpsJobEvents(jobId: string, limit = 10): BotOpsEventRecord[] {
  return db.prepare(`
    SELECT *
    FROM botops_events
    WHERE job_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(sanitizePublicText(jobId, 120), Math.max(1, Math.min(25, limit))) as BotOpsEventRecord[];
}

export function recordBotOpsWorkerHeartbeat(input: {
  worker_id: string;
  target: BotOpsTarget;
  host: string;
  capabilities: readonly BotOpsCapability[];
  status: string;
  detail: string;
  now?: Date;
}): void {
  const timestamp = (input.now ?? new Date()).toISOString();
  db.prepare(`
    INSERT INTO botops_worker_heartbeats (
      worker_id,
      target,
      host,
      capabilities,
      status,
      detail,
      heartbeat_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(worker_id) DO UPDATE SET
      target = excluded.target,
      host = excluded.host,
      capabilities = excluded.capabilities,
      status = excluded.status,
      detail = excluded.detail,
      heartbeat_at = excluded.heartbeat_at
  `).run(
    sanitizePublicText(input.worker_id, 120),
    input.target,
    sanitizePublicText(input.host, 120),
    [...new Set(input.capabilities)].join(", "),
    sanitizePublicText(input.status, 80),
    sanitizePublicText(input.detail, 300),
    timestamp,
  );
}

export function listBotOpsWorkerHeartbeats(target?: BotOpsTarget): BotOpsWorkerHeartbeatRecord[] {
  if (target) {
    return db.prepare(`
      SELECT *
      FROM botops_worker_heartbeats
      WHERE target = ?
      ORDER BY heartbeat_at DESC
    `).all(target) as BotOpsWorkerHeartbeatRecord[];
  }

  return db.prepare(`
    SELECT *
    FROM botops_worker_heartbeats
    ORDER BY heartbeat_at DESC
  `).all() as BotOpsWorkerHeartbeatRecord[];
}

export function createOrGetBotOpsJob(request: BotOpsJobRequest): {
  job: BotOpsJob;
  created: boolean;
} {
  const job = createBotOpsJob(request);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO botops_jobs (
      job_id,
      requested_by,
      target,
      capability,
      status,
      approval_state,
      approved_by,
      approval_expires_at,
      summary,
      payload_json,
      expected_action,
      validation_condition,
      lease_owner,
      lease_expires_at,
      heartbeat_at,
      logs,
      result,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = insert.run(
    job.job_id,
    sanitizePublicText(job.requested_by, 80),
    job.target,
    job.capability,
    job.status,
    job.approval_state,
    job.approved_by,
    job.approval_expires_at,
    sanitizePublicText(job.summary, 300),
    sanitizePublicText(job.payload_json, 2_000),
    sanitizePublicText(job.expected_action, 300),
    sanitizePublicText(job.validation_condition, 300),
    job.lease_owner,
    job.lease_expires_at,
    job.heartbeat_at,
    job.logs,
    job.result,
    job.created_at,
    job.updated_at,
  );
  if (result.changes === 1) {
    recordBotOpsEvent(
      job.job_id,
      "job.created",
      job.requested_by,
      `${job.target}/${job.capability}`,
      new Date(job.created_at),
    );
  }
  return {
    job: getBotOpsJob(job.job_id) ?? job,
    created: result.changes === 1,
  };
}

export function getBotOpsJob(jobId: string): BotOpsJob | undefined {
  const record = db
    .prepare("SELECT * FROM botops_jobs WHERE job_id = ?")
    .get(sanitizePublicText(jobId, 120)) as BotOpsJobRecord | undefined;
  return record ? botOpsJobFromRecord(record) : undefined;
}

export function listBotOpsJobs(limit = 10): BotOpsJob[] {
  const records = db
    .prepare("SELECT * FROM botops_jobs ORDER BY created_at DESC LIMIT ?")
    .all(Math.max(1, Math.min(25, limit))) as BotOpsJobRecord[];
  return records.map(botOpsJobFromRecord);
}

export function updateBotOpsJobStatus(
  jobId: string,
  status: BotOpsJobStatus,
  result = "",
): boolean {
  const updated = new Date().toISOString();
  const changed = db.prepare(`
    UPDATE botops_jobs
    SET status = ?, result = ?, updated_at = ?
    WHERE job_id = ?
  `).run(status, sanitizePublicText(result, 2_000), updated, sanitizePublicText(jobId, 120));
  if (changed.changes === 1) {
    recordBotOpsEvent(jobId, `status.${status}`, "system", result || status, nowFromIso(updated));
  }
  return changed.changes === 1;
}

export function approveBotOpsJob(
  jobId: string,
  approvedBy: string,
  now = new Date(),
  ttlMs = 15 * 60_000,
): BotOpsJob | undefined {
  const job = getBotOpsJob(jobId);
  if (!job) return undefined;
  if (job.approval_state !== "required") return job;

  const updated = now.toISOString();
  const expiresAt = new Date(now.getTime() + Math.max(1_000, ttlMs)).toISOString();
  const safeApprovedBy = sanitizePublicText(approvedBy, 80);
  const changed = db.prepare(`
    UPDATE botops_jobs
    SET approval_state = 'approved',
      status = 'Requested',
      approved_by = ?,
      approval_expires_at = ?,
      logs = ?,
      updated_at = ?
    WHERE job_id = ?
  `).run(safeApprovedBy, expiresAt, `approved by ${safeApprovedBy}`, updated, sanitizePublicText(jobId, 120));
  if (changed.changes === 1) {
    recordBotOpsEvent(jobId, "approval.approved", safeApprovedBy, `expires ${expiresAt}`, now);
  }
  return getBotOpsJob(jobId);
}

export function markExpiredBotOpsApprovals(now = new Date()): number {
  const timestamp = now.toISOString();
  const expiredJobs = db.prepare(`
    SELECT job_id
    FROM botops_jobs
    WHERE approval_state = 'approved'
      AND status = 'Requested'
      AND approval_expires_at IS NOT NULL
      AND approval_expires_at <= ?
  `).all(timestamp) as { job_id: string }[];

  const changed = db.prepare(`
    UPDATE botops_jobs
    SET approval_state = 'stale',
      status = 'WaitingApproval',
      result = 'approval expired',
      updated_at = ?
    WHERE approval_state = 'approved'
      AND status = 'Requested'
      AND approval_expires_at IS NOT NULL
      AND approval_expires_at <= ?
  `).run(timestamp, timestamp);
  for (const job of expiredJobs) {
    recordBotOpsEvent(job.job_id, "approval.stale", "system", "approval expired", now);
  }
  return changed.changes;
}

export function markExpiredBotOpsLeases(now = new Date()): number {
  const timestamp = now.toISOString();
  const expiredJobs = db.prepare(`
    SELECT job_id, lease_owner
    FROM botops_jobs
    WHERE status = 'Running'
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at <= ?
  `).all(timestamp) as { job_id: string; lease_owner: string | null }[];

  const changed = db.prepare(`
    UPDATE botops_jobs
    SET status = 'WaitingWorker',
      result = 'worker lease expired',
      lease_owner = NULL,
      lease_expires_at = NULL,
      updated_at = ?
    WHERE status = 'Running'
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at <= ?
  `).run(timestamp, timestamp);

  for (const job of expiredJobs) {
    recordBotOpsEvent(
      job.job_id,
      "worker.lease_expired",
      job.lease_owner ?? "system",
      "worker lease expired",
      now,
    );
  }

  return changed.changes;
}

export type BotOpsRecoveryResult =
  | { recovered: true; reason: "recovered"; job: BotOpsJob }
  | { recovered: false; reason: "not_found" | "not_waiting_worker" | "not_lease_expired" | "approval_missing" | "approval_stale"; job?: BotOpsJob };

export function recoverBotOpsWaitingWorkerJob(
  jobId: string,
  recoveredBy: string,
  now = new Date(),
): BotOpsRecoveryResult {
  const job = getBotOpsJob(jobId);
  if (!job) return { recovered: false, reason: "not_found" };
  if (job.status !== "WaitingWorker") {
    return { recovered: false, reason: "not_waiting_worker", job };
  }
  if (job.result !== "worker lease expired" || job.lease_owner || job.lease_expires_at) {
    return { recovered: false, reason: "not_lease_expired", job };
  }

  const timestamp = now.toISOString();
  const safeRecoveredBy = sanitizePublicText(recoveredBy, 80);
  if (job.approval_state === "approved") {
    if (!job.approval_expires_at) {
      recordBotOpsEvent(jobId, "worker.recovery_blocked", safeRecoveredBy, "approval missing expiry", now);
      return { recovered: false, reason: "approval_missing", job };
    }
    if (Date.parse(job.approval_expires_at) <= now.getTime()) {
      db.prepare(`
        UPDATE botops_jobs
        SET approval_state = 'stale',
          status = 'WaitingApproval',
          result = 'approval expired during recovery',
          updated_at = ?
        WHERE job_id = ?
          AND status = 'WaitingWorker'
      `).run(timestamp, sanitizePublicText(jobId, 120));
      recordBotOpsEvent(jobId, "approval.stale", safeRecoveredBy, "approval expired during recovery", now);
      const staleJob = getBotOpsJob(jobId) ?? job;
      return { recovered: false, reason: "approval_stale", job: staleJob };
    }
  } else if (job.approval_state !== "not_required") {
    recordBotOpsEvent(jobId, "worker.recovery_blocked", safeRecoveredBy, `approval ${job.approval_state}`, now);
    return { recovered: false, reason: "approval_missing", job };
  }

  const changed = db.prepare(`
    UPDATE botops_jobs
    SET status = 'Requested',
      heartbeat_at = NULL,
      logs = ?,
      result = ?,
      updated_at = ?
    WHERE job_id = ?
      AND status = 'WaitingWorker'
      AND result = 'worker lease expired'
      AND lease_owner IS NULL
      AND lease_expires_at IS NULL
  `).run(
    `recovered by ${safeRecoveredBy}`,
    "requeued after worker lease expiry",
    timestamp,
    sanitizePublicText(jobId, 120),
  );
  if (changed.changes !== 1) {
    return { recovered: false, reason: "not_lease_expired", job: getBotOpsJob(jobId) ?? job };
  }

  recordBotOpsEvent(jobId, "worker.recovered", safeRecoveredBy, "requeued after worker lease expiry", now);
  return { recovered: true, reason: "recovered", job: getBotOpsJob(jobId) ?? job };
}

export function acquireNextBotOpsJob(
  workerId: string,
  target: BotOpsTarget,
  capabilities: readonly BotOpsCapability[],
  leaseMs: number,
  now = new Date(),
): BotOpsJob | undefined {
  const uniqueCapabilities = [...new Set(capabilities)];
  if (uniqueCapabilities.length === 0) return undefined;
  markExpiredBotOpsApprovals(now);
  markExpiredBotOpsLeases(now);

  const placeholders = uniqueCapabilities.map(() => "?").join(", ");
  const record = db.prepare(`
    SELECT *
    FROM botops_jobs
    WHERE status = 'Requested'
      AND target = ?
      AND approval_state IN ('not_required', 'approved')
      AND capability IN (${placeholders})
    ORDER BY created_at ASC
    LIMIT 1
  `).get(target, ...uniqueCapabilities) as BotOpsJobRecord | undefined;

  if (!record) return undefined;

  const leaseExpiresAt = new Date(now.getTime() + Math.max(1_000, leaseMs)).toISOString();
  const updated = now.toISOString();
  const changed = db.prepare(`
    UPDATE botops_jobs
    SET status = 'Running',
      lease_owner = ?,
      lease_expires_at = ?,
      heartbeat_at = ?,
      updated_at = ?
    WHERE job_id = ?
      AND status = 'Requested'
  `).run(sanitizePublicText(workerId, 120), leaseExpiresAt, updated, updated, record.job_id);

  if (changed.changes !== 1) return undefined;
  recordBotOpsEvent(record.job_id, "worker.acquired", workerId, `lease expires ${leaseExpiresAt}`, now);
  return getBotOpsJob(record.job_id);
}

export function recordBotOpsHeartbeat(
  jobId: string,
  workerId: string,
  now = new Date(),
): boolean {
  const timestamp = now.toISOString();
  const changed = db.prepare(`
    UPDATE botops_jobs
    SET heartbeat_at = ?,
      updated_at = ?
    WHERE job_id = ?
      AND lease_owner = ?
      AND status = 'Running'
      AND lease_expires_at > ?
  `).run(
    timestamp,
    timestamp,
    sanitizePublicText(jobId, 120),
    sanitizePublicText(workerId, 120),
    timestamp,
  );
  return changed.changes === 1;
}

export function completeBotOpsJob(
  jobId: string,
  workerId: string,
  status: Extract<BotOpsJobStatus, "Completed" | "Failed" | "WaitingWorker">,
  result: string,
  now = new Date(),
): boolean {
  const updated = now.toISOString();
  const changed = db.prepare(`
    UPDATE botops_jobs
    SET status = ?,
      result = ?,
      lease_owner = NULL,
      lease_expires_at = NULL,
      updated_at = ?
    WHERE job_id = ?
      AND lease_owner = ?
      AND status = 'Running'
      AND lease_expires_at > ?
  `).run(
    status,
    sanitizePublicText(result, 2_000),
    updated,
    sanitizePublicText(jobId, 120),
    sanitizePublicText(workerId, 120),
    updated,
  );
  if (changed.changes === 1) {
    recordBotOpsEvent(jobId, `worker.${status}`, workerId, result, now);
  }
  return changed.changes === 1;
}

export function createAuditJob(input: AuditJobCreateInput): void {
  db.prepare(`
    INSERT INTO audit_jobs (
      id,
      channel_id,
      project_label,
      mode,
      status,
      requested_check,
      current_step,
      iteration,
      max_iterations,
      stop_requested,
      capabilities_json,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.id,
    input.channelId,
    sanitizePublicFileLabel(input.projectLabel),
    input.mode,
    input.status,
    input.requestedCheck ? sanitizePublicText(input.requestedCheck, 40) : null,
    input.currentStep,
    input.iteration,
    input.maxIterations,
    input.stopRequested ? 1 : 0,
    JSON.stringify(input.capabilities),
    input.createdAt,
    input.updatedAt,
  );
}

export function getAuditJob(jobId: string): AuditJobRecord | undefined {
  return db
    .prepare("SELECT * FROM audit_jobs WHERE id = ?")
    .get(jobId) as AuditJobRecord | undefined;
}

export function getLatestAuditJob(channelId: string): AuditJobRecord | undefined {
  return db
    .prepare("SELECT * FROM audit_jobs WHERE channel_id = ? ORDER BY updated_at DESC LIMIT 1")
    .get(channelId) as AuditJobRecord | undefined;
}

export function getActiveAuditJob(channelId: string): AuditJobRecord | undefined {
  const jobs = db
    .prepare("SELECT * FROM audit_jobs WHERE channel_id = ? ORDER BY updated_at DESC")
    .all(channelId) as AuditJobRecord[];
  return jobs.find((job) => !isTerminalAuditStatus(job.status as AuditJobStatus));
}

export function getActiveAuditJobByProjectPath(guildId: string, projectPath: string): AuditJobRecord | undefined {
  const jobs = db
    .prepare(`
      SELECT aj.*
      FROM audit_jobs aj
      JOIN projects p ON p.channel_id = aj.channel_id
      WHERE p.guild_id = ?
        AND p.project_path = ?
      ORDER BY aj.updated_at DESC
    `)
    .all(guildId, projectPath) as AuditJobRecord[];
  return jobs.find((job) => !isTerminalAuditStatus(job.status as AuditJobStatus));
}

export function normalizeInterruptedAuditJobs(now = new Date()): number {
  const interruptedStatuses = [
    "queued",
    "planning",
    "running_checks",
    "preparing_isolated_worktree",
    "repairing",
    "rechecking",
  ];
  const result = db.prepare(`
    UPDATE audit_jobs
    SET status = 'failed',
        current_step = NULL,
        stop_requested = 0,
        updated_at = ?
    WHERE status IN (${interruptedStatuses.map(() => "?").join(", ")})
  `).run(now.toISOString(), ...interruptedStatuses);
  return Number(result.changes);
}

export function updateAuditJobProgress(
  jobId: string,
  status: AuditJobRecord["status"],
  currentStep: string | null,
  iteration: number,
  updatedAt: string,
): void {
  db.prepare(`
    UPDATE audit_jobs
    SET status = ?, current_step = ?, iteration = ?, updated_at = ?
    WHERE id = ?
  `).run(status, currentStep, iteration, updatedAt, jobId);
}

export function requestAuditJobStop(jobId: string, updatedAt: string): void {
  db.prepare(`
    UPDATE audit_jobs
    SET stop_requested = 1, updated_at = ?
    WHERE id = ?
  `).run(updatedAt, jobId);
}

export function insertAuditStepResult(jobId: string, result: AuditCheckRunResult): string {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO audit_steps (
      id,
      job_id,
      step_name,
      status,
      exit_code,
      timed_out,
      stopped,
      public_output,
      started_at,
      finished_at,
      duration_ms
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    jobId,
    result.name,
    result.status,
    result.exitCode,
    result.timedOut ? 1 : 0,
    result.stopped ? 1 : 0,
    sanitizePublicText(result.publicOutput, 1_800) || "(no output)",
    result.startedAt,
    result.finishedAt,
    result.durationMs,
  );
  return id;
}

export function listAuditSteps(jobId: string): AuditStepRecord[] {
  return db
    .prepare("SELECT * FROM audit_steps WHERE job_id = ? ORDER BY started_at ASC, created_at ASC")
    .all(jobId) as AuditStepRecord[];
}

export function createAuditRepairWorktree(input: AuditRepairWorktreeCreateInput): void {
  db.prepare(`
    INSERT INTO audit_repair_worktrees (
      job_id,
      worktree_path,
      branch_name,
      head_commit,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.jobId,
    input.worktreePath,
    input.branchName,
    input.headCommit,
    input.status,
    input.createdAt,
    input.updatedAt,
  );
}

export function getAuditRepairWorktree(jobId: string): AuditRepairWorktreeRecord | undefined {
  return db
    .prepare("SELECT * FROM audit_repair_worktrees WHERE job_id = ?")
    .get(jobId) as AuditRepairWorktreeRecord | undefined;
}

export function updateAuditRepairWorktreeStatus(
  jobId: string,
  status: AuditRepairWorktreeStatus,
  updatedAt: string,
): void {
  db.prepare(`
    UPDATE audit_repair_worktrees
    SET status = ?, updated_at = ?
    WHERE job_id = ?
  `).run(status, updatedAt, jobId);
}

export function createAuditRepairExecution(input: AuditRepairExecutionCreateInput): void {
  db.prepare(`
    INSERT INTO audit_repair_executions (
      id,
      job_id,
      status,
      iteration,
      thread_id,
      turn_id,
      result_summary,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sanitizePublicText(input.id, 120),
    input.jobId,
    input.status,
    input.iteration,
    input.threadId ? sanitizePublicText(input.threadId, 160) : null,
    input.turnId ? sanitizePublicText(input.turnId, 160) : null,
    sanitizePublicText(input.resultSummary, 240) || "(no summary)",
    input.createdAt,
    input.updatedAt,
  );
}

export function getAuditRepairExecution(id: string): AuditRepairExecutionRecord | undefined {
  return db
    .prepare("SELECT * FROM audit_repair_executions WHERE id = ?")
    .get(sanitizePublicText(id, 120)) as AuditRepairExecutionRecord | undefined;
}

export function listAuditRepairExecutions(jobId: string, limit = 5): AuditRepairExecutionRecord[] {
  const safeLimit = Math.max(1, Math.min(10, Math.trunc(limit)));
  return db
    .prepare(`
      SELECT * FROM audit_repair_executions
      WHERE job_id = ?
      ORDER BY updated_at DESC, created_at DESC
      LIMIT ?
    `)
    .all(jobId, safeLimit) as AuditRepairExecutionRecord[];
}

export function updateAuditRepairExecutionResult(
  id: string,
  status: AuditRepairExecutionStatus,
  resultSummary: string,
  updatedAt: string,
  threadId?: string | null,
  turnId?: string | null,
): void {
  db.prepare(`
    UPDATE audit_repair_executions
    SET status = ?,
        result_summary = ?,
        updated_at = ?,
        thread_id = COALESCE(?, thread_id),
        turn_id = COALESCE(?, turn_id)
    WHERE id = ?
  `).run(
    status,
    sanitizePublicText(resultSummary, 240) || "(no summary)",
    updatedAt,
    threadId ? sanitizePublicText(threadId, 160) : null,
    turnId ? sanitizePublicText(turnId, 160) : null,
    sanitizePublicText(id, 120),
  );
}

export function createNasHandoffRequest(input: NasHandoffRequestCreateInput): void {
  db.prepare(`
    INSERT INTO nas_handoff_requests (
      id,
      channel_id,
      audit_job_id,
      project_label,
      check_name,
      status,
      result_summary,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sanitizePublicText(input.id, 120),
    input.channelId,
    input.auditJobId ? sanitizePublicText(input.auditJobId, 120) : null,
    sanitizePublicFileLabel(input.projectLabel),
    sanitizePublicText(input.checkName, 40),
    input.status,
    input.resultSummary ? sanitizePublicText(input.resultSummary, 240) : null,
    input.createdAt,
    input.updatedAt,
  );
}

export function updateNasHandoffRequestResult(
  id: string,
  status: NasHandoffRequestStatus,
  resultSummary: string,
  updatedAt: string,
): void {
  db.prepare(`
    UPDATE nas_handoff_requests
    SET status = ?,
        result_summary = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    status,
    sanitizePublicText(resultSummary, 240),
    updatedAt,
    sanitizePublicText(id, 120),
  );
}

export function getNasHandoffRequest(id: string): NasHandoffRequestRecord | undefined {
  return db
    .prepare("SELECT * FROM nas_handoff_requests WHERE id = ?")
    .get(sanitizePublicText(id, 120)) as NasHandoffRequestRecord | undefined;
}

export function listNasHandoffRequests(channelId: string, limit = 5): NasHandoffRequestRecord[] {
  const safeLimit = Math.max(1, Math.min(10, Math.trunc(limit)));
  return db
    .prepare("SELECT * FROM nas_handoff_requests WHERE channel_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT ?")
    .all(channelId, safeLimit) as NasHandoffRequestRecord[];
}

export function listNasHandoffRequestsByStatus(
  channelId: string,
  status: NasHandoffRequestStatusFilter = "all",
  limit = 5,
): NasHandoffRequestRecord[] {
  const safeLimit = Math.max(1, Math.min(10, Math.trunc(limit)));
  if (status === "all") {
    return listNasHandoffRequests(channelId, safeLimit);
  }

  return db
    .prepare(`
      SELECT * FROM nas_handoff_requests
      WHERE channel_id = ?
        AND status = ?
      ORDER BY updated_at DESC, created_at DESC
      LIMIT ?
    `)
    .all(channelId, status, safeLimit) as NasHandoffRequestRecord[];
}

export function findNasHandoffRequestsByIdPrefix(
  channelId: string,
  idPrefix: string,
  limit = 5,
): NasHandoffRequestRecord[] {
  const safePrefix = sanitizePublicText(idPrefix, 120)
    .replace(/[^a-zA-Z0-9._:-]/g, "")
    .slice(0, 80);
  if (safePrefix.length < 4) return [];

  const safeLimit = Math.max(1, Math.min(10, Math.trunc(limit)));
  return db
    .prepare(`
      SELECT * FROM nas_handoff_requests
      WHERE channel_id = ?
        AND id LIKE ?
      ORDER BY updated_at DESC, created_at DESC
      LIMIT ?
    `)
    .all(channelId, `${safePrefix}%`, safeLimit) as NasHandoffRequestRecord[];
}

export function countNasHandoffRequestsByStatus(channelId: string): NasHandoffRequestStatusCounts {
  const rows = db
    .prepare("SELECT status, COUNT(*) AS count FROM nas_handoff_requests WHERE channel_id = ? GROUP BY status")
    .all(channelId) as { status: NasHandoffRequestStatus; count: number }[];
  const counts: NasHandoffRequestStatusCounts = {
    queued: 0,
    completed: 0,
    failed: 0,
  };

  for (const row of rows) {
    if (row.status === "queued" || row.status === "completed" || row.status === "failed") {
      counts[row.status] = Number(row.count) || 0;
    }
  }

  return counts;
}

export function expireStaleNasHandoffRequests(
  olderThanIso: string,
  updatedAtIso: string,
  channelId?: string,
  limit = 25,
): NasHandoffRequestRecord[] {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const rows = channelId
    ? db
      .prepare(`
        SELECT * FROM nas_handoff_requests
        WHERE channel_id = ?
          AND status = 'queued'
          AND created_at < ?
        ORDER BY created_at ASC
        LIMIT ?
      `)
      .all(channelId, olderThanIso, safeLimit) as NasHandoffRequestRecord[]
    : db
      .prepare(`
        SELECT * FROM nas_handoff_requests
        WHERE status = 'queued'
          AND created_at < ?
        ORDER BY created_at ASC
        LIMIT ?
      `)
      .all(olderThanIso, safeLimit) as NasHandoffRequestRecord[];

  const update = db.prepare(`
    UPDATE nas_handoff_requests
    SET status = 'failed',
        result_summary = ?,
        updated_at = ?
    WHERE id = ?
      AND status = 'queued'
  `);
  const summary = "no NAS result before stale timeout";
  const updateMany = db.transaction((requests: NasHandoffRequestRecord[]) => {
    for (const request of requests) {
      update.run(summary, updatedAtIso, request.id);
    }
  });
  updateMany(rows);

  return rows.map((request) => ({
    ...request,
    status: "failed",
    result_summary: summary,
    updated_at: updatedAtIso,
  }));
}
