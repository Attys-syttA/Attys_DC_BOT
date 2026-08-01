import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { sanitizePublicFileLabel, sanitizePublicText } from "../utils/public-safety.js";
import type { AuditCheckRunResult } from "../audit/check-runner.js";
import { isTerminalAuditStatus, type AuditJobStatus } from "../audit/types.js";
import type {
  AuditJobCreateInput,
  AuditJobRecord,
  AuditStepRecord,
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
  `);
  ensureColumn("nas_handoff_requests", "audit_job_id", "TEXT");
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

export function createAuditJob(input: AuditJobCreateInput): void {
  db.prepare(`
    INSERT INTO audit_jobs (
      id,
      channel_id,
      project_label,
      mode,
      status,
      current_step,
      iteration,
      max_iterations,
      stop_requested,
      capabilities_json,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.id,
    input.channelId,
    sanitizePublicFileLabel(input.projectLabel),
    input.mode,
    input.status,
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
