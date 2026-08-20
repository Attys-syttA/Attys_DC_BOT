import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isAuditCheckName, type AuditCheckName } from "../../audit/check-catalog.js";
import { defaultAuditCapabilities } from "../../audit/types.js";
import { createAuditRequestHandoff } from "../../nas/audit-handoff.js";
import { readPublicHandoffStore } from "../../nas/handoff-store.js";
import {
  countNasHandoffRequestsByStatus,
  createAuditJob,
  createNasHandoffRequest,
  expireStaleNasHandoffRequests,
  findNasHandoffRequestsByIdPrefix,
  getActiveAuditJobByProjectPath,
  getNasHandoffRequest,
  getProject,
  insertAuditStepResult,
  listNasHandoffRequests,
  listNasHandoffRequestsByStatus,
  updateAuditJobProgress,
  updateNasHandoffRequestResult,
  createOrGetBotOpsJob,
  listBotOpsWorkerHeartbeats,
} from "../../db/database.js";
import type { NasHandoffRequestRecord, NasHandoffRequestStatusFilter } from "../../db/types.js";
import { formatBotOpsJobDetails, formatBotOpsWorkerHeartbeats } from "../../botops/render.js";
import {
  listHandoffEnvelopeFiles,
  readHandoffEnvelope,
  writeHandoffEnvelope,
  type HandoffBox,
  type HandoffEnvelope,
} from "../../nas/handoff-store.js";
import { verifyNasDeploy } from "../../nas/deploy-verification.js";
import { renderNasHandoffGateReport } from "../../nas/handoff-gate.js";
import { getConfig } from "../../utils/config.js";
import { L } from "../../utils/i18n.js";
import { sanitizePublicText } from "../../utils/public-safety.js";
import { npmCommand, runLocalCommand } from "./local-command.js";
import { recordOperatorEvent } from "../operator-events.js";

interface WorkerHttpStatus {
  running?: unknown;
  listening?: unknown;
  port?: unknown;
  processCount?: unknown;
}

interface WorkerHandoffStatus {
  running?: unknown;
  processCount?: unknown;
  handoffRootConfigured?: unknown;
  handoffRootReachable?: unknown;
}

interface NasBridgeSmokeResult {
  ok?: unknown;
  requestId?: unknown;
  check?: unknown;
  result?: unknown;
  summary?: unknown;
}

interface NasSyncDryRunResult {
  mode?: unknown;
  stagingSource?: {
    includeSource?: unknown;
    status?: unknown;
  };
  copiedOrReplaced?: unknown;
  skipped?: unknown;
  protectedSkipped?: unknown;
  removeBeforeCopy?: unknown;
  protectedPathsPreserved?: unknown;
}

interface NasContainerLifecycleResult {
  ok?: unknown;
  action?: unknown;
  durationSec?: unknown;
  exitCode?: unknown;
  output?: unknown;
}

interface NasControlPlaneStatusSnapshot {
  buildInfo?: {
    sourceCommit?: unknown;
    packageVersion?: unknown;
    generatedAt?: unknown;
    includeSource?: unknown;
  };
  handoffStore?: {
    rootStatus?: unknown;
  };
  checkedAt?: unknown;
}

type NasBridgeAction = "status" | "start" | "stop" | "restart";

export const data = new SlashCommandBuilder()
  .setName("nas")
  .setDescription("Show public-safe NAS bridge status")
  .addSubcommand((subcommand) => subcommand
    .setName("status")
    .setDescription("Show PC worker and NAS handoff status"))
  .addSubcommand((subcommand) => subcommand
    .setName("doctor")
    .setDescription("Run a public-safe read-only NAS bridge diagnostic"))
  .addSubcommand((subcommand) => subcommand
    .setName("request")
    .setDescription("Queue a fixed audit request through the NAS handoff inbox")
    .addStringOption((option) => option
      .setName("check")
      .setDescription("Named check to request")
      .setRequired(true)
      .addChoices(
        { name: "plans", value: "plans" },
        { name: "lint", value: "lint" },
        { name: "typecheck", value: "typecheck" },
        { name: "tests", value: "tests" },
        { name: "build", value: "build" },
        { name: "full", value: "full" },
      )))
  .addSubcommand((subcommand) => subcommand
    .setName("results")
    .setDescription("Show latest public-safe NAS handoff results")
    .addIntegerOption((option) => option
      .setName("limit")
      .setDescription("Maximum results to show")
      .setMinValue(1)
      .setMaxValue(10)))
  .addSubcommand((subcommand) => subcommand
    .setName("requests")
    .setDescription("Show tracked public-safe NAS handoff requests")
    .addStringOption((option) => option
      .setName("status")
      .setDescription("Request status filter")
      .addChoices(
        { name: "all", value: "all" },
        { name: "queued", value: "queued" },
        { name: "completed", value: "completed" },
        { name: "failed", value: "failed" },
      ))
    .addIntegerOption((option) => option
      .setName("limit")
      .setDescription("Maximum requests to show")
      .setMinValue(1)
      .setMaxValue(10)))
  .addSubcommand((subcommand) => subcommand
    .setName("request-status")
    .setDescription("Show one tracked public-safe NAS handoff request")
    .addStringOption((option) => option
      .setName("request")
      .setDescription("Request id or id prefix")
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName("mailbox")
    .setDescription("Show public-safe NAS handoff mailbox messages")
    .addStringOption((option) => option
      .setName("box")
      .setDescription("Mailbox box to inspect")
      .setRequired(true)
      .addChoices(
        { name: "inbox", value: "inbox" },
        { name: "outbox", value: "outbox" },
        { name: "archive", value: "archive" },
      ))
    .addIntegerOption((option) => option
      .setName("limit")
      .setDescription("Maximum messages to show")
      .setMinValue(1)
      .setMaxValue(10)))
  .addSubcommand((subcommand) => subcommand
    .setName("mailbox-status")
    .setDescription("Show public-safe NAS handoff mailbox consistency status"))
  .addSubcommand((subcommand) => subcommand
    .setName("bridge")
    .setDescription("Control the local PC NAS bridge lifecycle")
    .addStringOption((option) => option
      .setName("action")
      .setDescription("Lifecycle action")
      .setRequired(true)
      .addChoices(
        { name: "status", value: "status" },
        { name: "start", value: "start" },
        { name: "stop", value: "stop" },
        { name: "restart", value: "restart" },
      )))
  .addSubcommand((subcommand) => subcommand
    .setName("smoke")
    .setDescription("Run one fixed public-safe NAS bridge smoke"))
  .addSubcommand((subcommand) => subcommand
    .setName("sync-status")
    .setDescription("Dry-run check whether NAS staging differs from the NAS share"))
  .addSubcommand((subcommand) => subcommand
    .setName("deploy-status")
    .setDescription("Verify NAS deployed files against the running control-plane snapshot"))
  .addSubcommand((subcommand) => subcommand
    .setName("deploy-plan")
    .setDescription("Preview the NAS deploy helper dry-run without applying changes"))
  .addSubcommand((subcommand) => subcommand
    .setName("deploy-apply")
    .setDescription("Queue an approval-gated NAS deploy apply worker job"))
  .addSubcommand((subcommand) => subcommand
    .setName("rollback-plan")
    .setDescription("Preview NAS rollback requirements without applying rollback")
    .addStringOption((option) => option
      .setName("commit")
      .setDescription("Optional Git commit to validate as the planned rollback source")
      .setRequired(false)
      .setMinLength(7)
      .setMaxLength(40)))
  .addSubcommand((subcommand) => subcommand
    .setName("handoff-gate")
    .setDescription("Show the read-only NAS architecture handoff gate"))
  .addSubcommand((subcommand) => subcommand
    .setName("container-status")
    .setDescription("Show read-only NAS control-plane container status"))
  .addSubcommand((subcommand) => subcommand
    .setName("worker-status")
    .setDescription("Queue a fixed NAS worker health check"))
  .addSubcommand((subcommand) => subcommand
    .setName("worker-deploy-verify")
    .setDescription("Queue an approval-gated NAS deploy verifier worker job"));

function ok(value: unknown): boolean {
  return value === true;
}

function count(value: unknown): string {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? String(value)
    : "unknown";
}

function parseJsonObject(output: string): unknown {
  const trimmed = output.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Fall back to line scanning for commands that print preface text before a compact JSON line.
    }
  }

  const firstObjectStart = trimmed.indexOf("{");
  const lastObjectEnd = trimmed.lastIndexOf("}");
  if (firstObjectStart !== -1 && lastObjectEnd > firstObjectStart) {
    try {
      return JSON.parse(trimmed.slice(firstObjectStart, lastObjectEnd + 1));
    } catch {
      // Fall back to compact line scanning below.
    }
  }

  for (const line of trimmed.split(/\r?\n/).reverse()) {
    const candidate = line.trim();
    if (!candidate.startsWith("{")) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  return null;
}

export function readHandoffRootFromWorkerEnv(repoRoot: string): string {
  const envPath = path.join(repoRoot, ".env.worker.local");
  if (!fs.existsSync(envPath)) return "";
  const line = fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((entry) => /^\s*ATTYS_NAS_HANDOFF_ROOT\s*=/.test(entry));
  if (!line) return "";
  return line.replace(/^\s*ATTYS_NAS_HANDOFF_ROOT\s*=\s*/, "").trim().replace(/^["']|["']$/g, "");
}

export function projectFolderLabel(projectPath: string): string {
  return projectPath.trim().replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean).at(-1) ?? projectPath;
}

function workerHttpLine(status: WorkerHttpStatus | null): string {
  if (!status) return "FAIL worker http: status unavailable";
  if (ok(status.running) && ok(status.listening)) {
    return `OK worker http: listening on configured port, processes ${count(status.processCount)}`;
  }
  if (ok(status.running)) {
    return `INFO worker http: running but listener not confirmed, processes ${count(status.processCount)}`;
  }
  return "FAIL worker http: not running";
}

function handoffWorkerLine(status: WorkerHandoffStatus | null): string {
  if (!status) return "FAIL handoff worker: status unavailable";
  if (ok(status.running) && ok(status.handoffRootReachable)) {
    return `OK handoff worker: running, NAS root reachable, processes ${count(status.processCount)}`;
  }
  if (ok(status.running)) {
    return `FAIL handoff worker: running but NAS root not reachable, processes ${count(status.processCount)}`;
  }
  if (ok(status.handoffRootConfigured) && ok(status.handoffRootReachable)) {
    return "INFO handoff worker: stopped, NAS root reachable";
  }
  return "FAIL handoff worker: stopped or NAS root missing";
}

function nasBridgeActionLabel(action: NasBridgeAction): string {
  switch (action) {
    case "start":
      return "start requested";
    case "stop":
      return "stop requested";
    case "restart":
      return "restart requested";
    case "status":
      return "status";
  }
}

function bridgeReadyLine(http: WorkerHttpStatus | null, handoff: WorkerHandoffStatus | null): string {
  if (
    http &&
    handoff &&
    ok(http.running) &&
    ok(http.listening) &&
    ok(handoff.running) &&
    ok(handoff.handoffRootReachable)
  ) {
    return "OK bridge ready: PC worker and NAS handoff are connected";
  }
  return "INFO bridge ready: not fully ready";
}

function handoffStoreLine(repoRoot: string): string {
  const handoffRoot = readHandoffRootFromWorkerEnv(repoRoot);
  if (!handoffRoot || !fs.existsSync(handoffRoot)) {
    return "INFO handoff mailbox: NAS root unavailable to bot process";
  }

  const store = readPublicHandoffStore(handoffRoot);
  if (store.rootStatus !== "ready") {
    return `FAIL handoff mailbox: ${store.rootStatus}`;
  }

  const boxes = store.boxes
    .map((box) => `${box.box}:${box.validMessages}`)
    .join(" ");
  return `OK handoff mailbox: ${boxes}`;
}

function nasControlPlaneStatusPath(repoRoot: string): string | null {
  const handoffRoot = readHandoffRootFromWorkerEnv(repoRoot);
  if (!handoffRoot) return null;
  return path.join(path.dirname(path.dirname(handoffRoot)), "logs", "nas-control-plane-status.json");
}

function nasShareRoot(repoRoot: string): string | null {
  const handoffRoot = readHandoffRootFromWorkerEnv(repoRoot);
  if (!handoffRoot) return null;
  return path.dirname(path.dirname(handoffRoot));
}

function nasControlPlaneSnapshotLine(repoRoot: string): string {
  const statusPath = nasControlPlaneStatusPath(repoRoot);
  if (!statusPath || !fs.existsSync(statusPath)) {
    return "INFO NAS control-plane snapshot: unavailable";
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(statusPath, "utf8")) as NasControlPlaneStatusSnapshot;
    const sourceCommit = smokeField(parsed.buildInfo?.sourceCommit, "unknown", 40);
    const packageVersion = smokeField(parsed.buildInfo?.packageVersion, "unknown", 40);
    const handoffStatus = smokeField(parsed.handoffStore?.rootStatus, "unknown", 40);
    const checkedAt = smokeField(parsed.checkedAt, "unknown", 40);
    return `OK NAS control-plane snapshot: build=${sourceCommit} version=${packageVersion} handoff=${handoffStatus} checked=${checkedAt}`;
  } catch {
    return "WARN NAS control-plane snapshot: unreadable";
  }
}

function nasDeployVerificationLine(repoRoot: string): string {
  const shareRoot = nasShareRoot(repoRoot);
  if (!shareRoot || !fs.existsSync(shareRoot)) {
    return "INFO NAS deploy verification: unavailable";
  }

  const result = verifyNasDeploy(shareRoot);
  const passed = result.checks.filter((check) => check.ok).length;
  const total = result.checks.length;
  const sourceCommit = smokeField(result.sourceCommit, "unknown", 40);
  const packageVersion = smokeField(result.packageVersion, "unknown", 40);
  return result.ok
    ? `OK NAS deploy verification: build=${sourceCommit} version=${packageVersion} checks=${passed}/${total}`
    : `WARN NAS deploy verification: build=${sourceCommit} version=${packageVersion} checks=${passed}/${total}`;
}

export function buildNasDeployStatusReport(repoRoot: string): string {
  const shareRoot = nasShareRoot(repoRoot);
  if (!shareRoot || !fs.existsSync(shareRoot)) {
    return "**NAS Deploy Status**\n```text\nINFO deploy verification unavailable\n```";
  }

  const result = verifyNasDeploy(shareRoot);
  const passed = result.checks.filter((check) => check.ok).length;
  const total = result.checks.length;
  const rows = result.checks.map((check) => {
    const status = check.ok ? "OK" : "FAIL";
    return `${status} ${check.name}: ${smokeField(check.summary, "unknown", 120)}`;
  });

  return [
    "**NAS Deploy Status**",
    "```text",
    result.ok ? "OK deploy verified" : "WARN deploy verification needs attention",
    `build=${smokeField(result.sourceCommit, "unknown", 40)} version=${smokeField(result.packageVersion, "unknown", 40)}`,
    `checks=${passed}/${total}`,
    ...rows,
    "```",
  ].join("\n");
}

function safeOutputLines(output: string, maxLines = 8): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/[A-Za-z]:\\/.test(line))
    .filter((line) => !line.includes("-Apply"))
    .map((line) => sanitizePublicText(line, 160))
    .filter((line) => !line.includes("<local-path>"))
    .slice(0, maxLines);
}

function nasDeployPlanRebuildLine(repoRoot: string): string {
  const shareRoot = nasShareRoot(repoRoot);
  if (!shareRoot || !fs.existsSync(shareRoot)) {
    return "will-rebuild=unknown reason=deploy-verifier-unavailable";
  }

  try {
    const result = verifyNasDeploy(shareRoot);
    return result.ok
      ? "will-rebuild=no reason=current-deploy-verified"
      : "will-rebuild=yes reason=current-deploy-not-verified";
  } catch {
    return "will-rebuild=unknown reason=deploy-verifier-unreadable";
  }
}

export async function buildNasDeployPlanReport(repoRoot: string): Promise<string> {
  const result = await runLocalCommand(npmCommand(), ["run", "--silent", "nas:deploy"], repoRoot, 90_000);
  const outputLines = safeOutputLines(result.output);

  return [
    "**NAS Deploy Plan**",
    "```text",
    result.exitCode === 0 ? "OK deploy dry-run completed" : "FAIL deploy dry-run failed",
    "mode=dry-run",
    "apply=disabled",
    "apply-preview=approval-required",
    nasDeployPlanRebuildLine(repoRoot),
    "force-rebuild=disabled",
    "nas-share-write=disabled",
    "container-rebuild=disabled-from-this-command",
    "restart=disabled",
    outputLines.length > 0 ? "helper summary:" : "helper summary: none",
    ...outputLines.map((line) => `- ${line}`),
    "```",
  ].join("\n");
}

function normalizeRollbackCommitCandidate(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return /^[0-9a-f]{7,40}$/i.test(trimmed) ? trimmed : "invalid";
}

async function rollbackCommitCandidateLine(repoRoot: string, requestedCommit: string | null | undefined): Promise<string> {
  const candidate = normalizeRollbackCommitCandidate(requestedCommit);
  if (!candidate) return "candidate-commit=not-selected";
  if (candidate === "invalid") return "candidate-commit=invalid reason=expected-hex-git-commit";

  const result = await runLocalCommand("git", ["rev-parse", "--verify", "--short=12", `${candidate}^{commit}`], repoRoot, 15_000);
  if (result.exitCode !== 0 || result.timedOut) return "candidate-commit=invalid reason=not-a-commit";

  const resolved = result.output.match(/\b[0-9a-f]{7,40}\b/i)?.[0] ?? candidate;
  return `candidate-commit=${smokeField(resolved.slice(0, 12), "unknown", 12)} status=valid`;
}

export async function buildNasRollbackPlanReport(repoRoot: string, requestedCommit?: string | null): Promise<string> {
  const shareRoot = nasShareRoot(repoRoot);
  const lines = [
    "**NAS Rollback Plan**",
    "```text",
    "mode=read-only",
    "rollback-apply=disabled",
    "rollback-source=git-commit",
    "required-approval=two-step-required",
    "verify-failure=WaitingManualReview",
  ];

  lines.push(await rollbackCommitCandidateLine(repoRoot, requestedCommit));

  if (!shareRoot || !fs.existsSync(shareRoot)) {
    lines.push("current-deploy=unknown reason=deploy-verifier-unavailable");
  } else {
    try {
      const result = verifyNasDeploy(shareRoot);
      const passed = result.checks.filter((check) => check.ok).length;
      const total = result.checks.length;
      lines.push(result.ok ? "current-deploy=verified" : "current-deploy=not-verified");
      lines.push(`current-build=${smokeField(result.sourceCommit, "unknown", 40)} version=${smokeField(result.packageVersion, "unknown", 40)} checks=${passed}/${total}`);
    } catch {
      lines.push("current-deploy=unknown reason=deploy-verifier-unreadable");
    }
  }

  lines.push("next=choose exact rollback commit before any apply command");
  lines.push("```");
  return lines.join("\n");
}

function expectedNasContainerRunning(parsed: NasContainerLifecycleResult | null): boolean {
  if (!parsed || parsed.ok !== true || !Array.isArray(parsed.output)) return false;
  return parsed.output.some((entry) => {
    if (typeof entry !== "string") return false;
    return /^\s*attys-dc-bot-control-plane\s/.test(entry) && /\bUp\b/i.test(entry);
  });
}

function nasContainerDuration(parsed: NasContainerLifecycleResult | null): string {
  return typeof parsed?.durationSec === "number" && Number.isFinite(parsed.durationSec) && parsed.durationSec >= 0
    ? `${Math.round(parsed.durationSec * 10) / 10}s`
    : "unknown";
}

function nasContainerOutputCount(parsed: NasContainerLifecycleResult | null): string {
  return Array.isArray(parsed?.output)
    ? String(parsed.output.filter((entry) => typeof entry === "string").length)
    : "unknown";
}

function nasContainerImageTag(parsed: NasContainerLifecycleResult | null): string {
  if (!Array.isArray(parsed?.output)) return "unknown";

  for (const entry of parsed.output) {
    if (typeof entry !== "string") continue;
    const match = /\battys-dc-bot-control-plane:([a-f0-9]{12})\b/i.exec(entry);
    if (match) return match[1].toLowerCase();
  }

  return "unknown";
}

function nasContainerStatusLine(result: Awaited<ReturnType<typeof runLocalCommand>>): string {
  const parsed = result.exitCode === 0
    ? parseJsonObject(result.output) as NasContainerLifecycleResult | null
    : null;
  if (result.exitCode !== 0) return "FAIL NAS container: status unavailable";
  if (expectedNasContainerRunning(parsed)) {
    return `OK NAS container: control-plane service is up, image=${nasContainerImageTag(parsed)}, duration ${nasContainerDuration(parsed)}`;
  }
  return `WARN NAS container: control-plane service not confirmed up, output lines ${nasContainerOutputCount(parsed)}`;
}

export async function buildNasContainerStatusReport(repoRoot: string): Promise<string> {
  const result = await runLocalCommand(npmCommand(), ["run", "--silent", "nas:container:status", "--", "-Json"], repoRoot, 30_000);
  const parsed = result.exitCode === 0
    ? parseJsonObject(result.output) as NasContainerLifecycleResult | null
    : null;
  const running = expectedNasContainerRunning(parsed);
  const statusLine = result.exitCode !== 0
    ? "FAIL NAS container status unavailable"
    : running
      ? "OK NAS container: control-plane service is up"
      : "WARN NAS container: control-plane service not confirmed up";

  return [
    "**NAS Container Status**",
    "```text",
    statusLine,
    `reachable=${result.exitCode === 0 ? "yes" : "no"}`,
    `image=${nasContainerImageTag(parsed)}`,
    `duration=${nasContainerDuration(parsed)}`,
    `remote-output-lines=${nasContainerOutputCount(parsed)}`,
    "raw-output=hidden",
    "writes=disabled",
    "```",
  ].join("\n");
}

function resultNotifierLine(): string {
  const config = getConfig();
  if (config.DISCORD_ENABLE_NAS_RESULT_NOTIFICATIONS === true) {
    const intervalMs = typeof config.DISCORD_NAS_RESULT_POLL_INTERVAL_MS === "number"
      ? config.DISCORD_NAS_RESULT_POLL_INTERVAL_MS
      : 60_000;
    return `OK result notifier: enabled, poll ${Math.round(intervalMs / 1000)}s`;
  }
  return "INFO result notifier: disabled";
}

function requestStaleTimeoutLine(): string {
  const staleAfterMs = getConfig().DISCORD_NAS_REQUEST_STALE_AFTER_MS;
  return `OK request stale timeout: ${Math.round(staleAfterMs / 60_000)}m`;
}

function requestTrackingLine(channelId: string | undefined): string {
  if (!channelId) return "INFO request tracking: channel unavailable";
  expireStaleNasHandoffRequestsForChannel(channelId);
  const counts = countNasHandoffRequestsByStatus(channelId);
  return `OK request tracking: queued:${counts.queued} completed:${counts.completed} failed:${counts.failed}`;
}

function requestAgeLine(createdAt: string, updatedAt: string, now = new Date()): string {
  const createdTime = Date.parse(createdAt);
  const updatedTime = Date.parse(updatedAt);
  const ageMinutes = Number.isFinite(createdTime)
    ? Math.max(0, Math.floor((now.getTime() - createdTime) / 60_000))
    : null;
  const updatedMinutes = Number.isFinite(updatedTime)
    ? Math.max(0, Math.floor((now.getTime() - updatedTime) / 60_000))
    : null;
  const age = ageMinutes === null ? "age=unknown" : `age=${ageMinutes}m`;
  const updated = updatedMinutes === null ? "updated=unknown" : `updated=${updatedMinutes}m`;
  return `${age} ${updated}`;
}

export function nasRequestStaleCutoff(now = new Date()): string {
  const staleAfterMs = getConfig().DISCORD_NAS_REQUEST_STALE_AFTER_MS;
  const safeStaleAfterMs = typeof staleAfterMs === "number" && Number.isFinite(staleAfterMs) && staleAfterMs > 0
    ? staleAfterMs
    : 900_000;
  return new Date(now.getTime() - safeStaleAfterMs).toISOString();
}

export function expireStaleNasHandoffRequestsForChannel(channelId: string, now = new Date(), repoRoot = process.cwd()): number {
  const expired = expireStaleNasHandoffRequests(
    nasRequestStaleCutoff(now),
    now.toISOString(),
    channelId,
  );
  for (const request of expired) {
    closeNasLinkedAuditJob(request, "failed", "no NAS result before stale timeout", now.toISOString());
    recordOperatorEvent({ kind: "task", status: "nas-request-timeout", channelId: request.channel_id }, repoRoot);
  }
  return expired.length;
}

function resultStatus(value: string | undefined, fallback: HandoffEnvelope["status"]): "completed" | "failed" {
  if (value === "passed") return "completed";
  if (value === "failed") return "failed";
  return fallback === "completed" ? "completed" : "failed";
}

function createNasLinkedAuditJob(channelId: string, projectLabel: string, checkName: AuditCheckName, now: string): string {
  const auditJobId = randomUUID();
  createAuditJob({
    id: auditJobId,
    channelId,
    projectLabel,
    mode: "check-only",
    status: "waiting_nas_result",
    requestedCheck: checkName,
    currentStep: checkName,
    iteration: 0,
    maxIterations: 1,
    stopRequested: false,
    capabilities: defaultAuditCapabilities("check-only"),
    createdAt: now,
    updatedAt: now,
  });
  return auditJobId;
}

export function closeNasLinkedAuditJob(
  request: NasHandoffRequestRecord,
  status: "completed" | "failed",
  summary: string,
  finishedAt: string,
): void {
  if (!request.audit_job_id) return;
  const finalStatus = status === "completed" ? "completed" : "waiting_manual_review";
  const publicOutput = sanitizePublicText(summary, 1_800) || (status === "completed" ? "NAS check passed" : "NAS check failed");
  insertAuditStepResult(request.audit_job_id, {
    name: request.check_name as AuditCheckName,
    status: status === "completed" ? "passed" : "failed",
    exitCode: status === "completed" ? 0 : 1,
    timedOut: false,
    stopped: false,
    publicOutput,
    startedAt: request.created_at,
    finishedAt,
    durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(request.created_at)) || 0,
  });
  updateAuditJobProgress(request.audit_job_id, finalStatus, null, 1, finishedAt);
}

export async function buildNasStatusReport(repoRoot: string, channelId?: string): Promise<string> {
  const [workerHttp, handoffWorker] = await Promise.all([
    runLocalCommand(npmCommand(), ["run", "--silent", "worker:http:status"], repoRoot, 15_000),
    runLocalCommand(npmCommand(), ["run", "--silent", "worker:handoff:status"], repoRoot, 15_000),
  ]);

  const workerHttpStatus = workerHttp.exitCode === 0
    ? parseJsonObject(workerHttp.output) as WorkerHttpStatus | null
    : null;
  const handoffWorkerStatus = handoffWorker.exitCode === 0
    ? parseJsonObject(handoffWorker.output) as WorkerHandoffStatus | null
    : null;

  return [
    "**NAS Bridge Status**",
    "```text",
    bridgeReadyLine(workerHttpStatus, handoffWorkerStatus),
    workerHttpLine(workerHttpStatus),
    handoffWorkerLine(handoffWorkerStatus),
    handoffStoreLine(repoRoot),
    nasControlPlaneSnapshotLine(repoRoot),
    nasDeployVerificationLine(repoRoot),
    resultNotifierLine(),
    requestStaleTimeoutLine(),
    requestTrackingLine(channelId),
    "```",
  ].join("\n");
}

export async function buildNasBridgeLifecycleReport(repoRoot: string, action: NasBridgeAction): Promise<string> {
  const result = await runLocalCommand(npmCommand(), ["run", "--silent", `nas:bridge:${action}`], repoRoot, 45_000);
  const parsed = result.exitCode === 0
    ? parseJsonObject(result.output) as { http?: WorkerHttpStatus; handoff?: WorkerHandoffStatus } | null
    : null;
  const workerHttpStatus = parsed?.http ?? null;
  const handoffWorkerStatus = parsed?.handoff ?? null;

  return [
    "**NAS Bridge Lifecycle**",
    "```text",
    `action: ${nasBridgeActionLabel(action)}`,
    result.exitCode === 0 ? "OK lifecycle command completed" : "FAIL lifecycle command failed",
    bridgeReadyLine(workerHttpStatus, handoffWorkerStatus),
    workerHttpLine(workerHttpStatus),
    handoffWorkerLine(handoffWorkerStatus),
    "```",
  ].join("\n");
}

function smokeField(value: unknown, fallback: string, maxLength = 120): string {
  return sanitizePublicText(typeof value === "string" ? value : fallback, maxLength) || fallback;
}

export async function buildNasBridgeSmokeReport(repoRoot: string): Promise<string> {
  const result = await runLocalCommand(npmCommand(), ["run", "--silent", "nas:bridge:smoke"], repoRoot, 90_000);
  const parsed = parseJsonObject(result.output) as NasBridgeSmokeResult | null;
  const smokeOk = result.exitCode === 0 && parsed?.ok === true;
  const requestId = smokeField(parsed?.requestId, "unknown", 80);
  const check = smokeField(parsed?.check, "unknown", 40);
  const smokeResult = smokeField(parsed?.result, smokeOk ? "passed" : "failed", 40);
  const summary = smokeField(parsed?.summary, smokeOk ? "smoke completed" : "smoke failed", 180);

  return [
    "**NAS Bridge Smoke**",
    "```text",
    smokeOk ? "OK smoke completed" : "FAIL smoke failed",
    `request=${requestId}`,
    `check=${check} result=${smokeResult}`,
    `summary=${summary}`,
    "```",
  ].join("\n");
}

function summaryCount(value: unknown): string {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? String(value)
    : "unknown";
}

export async function buildNasSyncStatusReport(repoRoot: string): Promise<string> {
  const result = await runLocalCommand(npmCommand(), ["run", "--silent", "nas:sync-share", "--", "-Json"], repoRoot, 60_000);
  const parsed = result.exitCode === 0
    ? parseJsonObject(result.output) as NasSyncDryRunResult | null
    : null;

  const changed = summaryCount(parsed?.copiedOrReplaced);
  const skipped = summaryCount(parsed?.skipped);
  const protectedSkipped = summaryCount(parsed?.protectedSkipped);
  const mode = smokeField(parsed?.mode, "dry-run", 40);
  const removeBeforeCopy = parsed?.removeBeforeCopy === true ? "enabled" : "disabled";
  const stagingSourceStatus = smokeField(parsed?.stagingSource?.status, "unknown", 40);
  let readyLine = "FAIL NAS sync dry-run failed";
  if (result.exitCode === 0 && stagingSourceStatus === "stale") {
    readyLine = "INFO NAS staging source is stale";
  } else if (result.exitCode === 0 && changed === "0") {
    readyLine = "OK NAS share in sync for managed files";
  } else if (result.exitCode === 0) {
    readyLine = "INFO NAS share has pending managed file changes";
  }

  return [
    "**NAS Sync Status**",
    "```text",
    readyLine,
    `mode=${mode}`,
    `staging-source=${stagingSourceStatus}`,
    `pending=${changed} unchanged=${skipped} protected=${protectedSkipped}`,
    `delete-before-copy=${removeBeforeCopy}`,
    "writes=disabled",
    "```",
  ].join("\n");
}

function syncDryRunLine(result: Awaited<ReturnType<typeof runLocalCommand>>): string {
  const parsed = result.exitCode === 0
    ? parseJsonObject(result.output) as NasSyncDryRunResult | null
    : null;
  const changed = summaryCount(parsed?.copiedOrReplaced);
  const skipped = summaryCount(parsed?.skipped);
  const protectedSkipped = summaryCount(parsed?.protectedSkipped);
  const stagingSourceStatus = smokeField(parsed?.stagingSource?.status, "unknown", 40);

  if (result.exitCode !== 0) {
    return "FAIL sync dry-run: unavailable";
  }
  if (stagingSourceStatus === "stale") {
    return `WARN sync dry-run: staging-source=stale pending=${changed} unchanged=${skipped} protected=${protectedSkipped}`;
  }
  if (changed === "0") {
    return `OK sync dry-run: staging-source=${stagingSourceStatus} pending=0 unchanged=${skipped} protected=${protectedSkipped}`;
  }
  return `INFO sync dry-run: staging-source=${stagingSourceStatus} pending=${changed} unchanged=${skipped} protected=${protectedSkipped}`;
}

function mailboxStatusLines(repoRoot: string, channelId: string): string[] {
  try {
    return buildNasMailboxStatusReport(repoRoot, channelId)
      .split(/\r?\n/)
      .filter((line) => line && line !== "**NAS Handoff Mailbox Status**" && line !== "```");
  } catch {
    return ["WARN mailbox consistency: unavailable"];
  }
}

export async function buildNasDoctorReport(repoRoot: string, channelId: string): Promise<string> {
  const [workerHttp, handoffWorker, syncDryRun, containerStatus] = await Promise.all([
    runLocalCommand(npmCommand(), ["run", "--silent", "worker:http:status"], repoRoot, 15_000),
    runLocalCommand(npmCommand(), ["run", "--silent", "worker:handoff:status"], repoRoot, 15_000),
    runLocalCommand(npmCommand(), ["run", "--silent", "nas:sync-share", "--", "-Json"], repoRoot, 60_000),
    runLocalCommand(npmCommand(), ["run", "--silent", "nas:container:status", "--", "-Json"], repoRoot, 30_000),
  ]);

  const workerHttpStatus = workerHttp.exitCode === 0
    ? parseJsonObject(workerHttp.output) as WorkerHttpStatus | null
    : null;
  const handoffWorkerStatus = handoffWorker.exitCode === 0
    ? parseJsonObject(handoffWorker.output) as WorkerHandoffStatus | null
    : null;

  const lines = [
    bridgeReadyLine(workerHttpStatus, handoffWorkerStatus),
    workerHttpLine(workerHttpStatus),
    handoffWorkerLine(handoffWorkerStatus),
    handoffStoreLine(repoRoot),
    nasControlPlaneSnapshotLine(repoRoot),
    nasDeployVerificationLine(repoRoot),
    nasContainerStatusLine(containerStatus),
    syncDryRunLine(syncDryRun),
    ...mailboxStatusLines(repoRoot, channelId),
    resultNotifierLine(),
    requestStaleTimeoutLine(),
  ];
  const needsAttention = lines.some((line) => /^(FAIL|WARN)\b/.test(line));

  return [
    "**NAS Doctor**",
    "```text",
    needsAttention ? "overall=attention" : "overall=ok",
    ...lines,
    "writes=disabled",
    "```",
  ].join("\n");
}

export function buildNasResultsReport(repoRoot: string, channelId: string, limit = 5): string {
  expireStaleNasHandoffRequestsForChannel(channelId, new Date(), repoRoot);
  const handoffRoot = readHandoffRootFromWorkerEnv(repoRoot);
  if (!handoffRoot || !fs.existsSync(handoffRoot)) {
    return "**NAS Handoff Results**\n```text\nINFO handoff mailbox unavailable to bot process\n```";
  }

  const outboxResults = listHandoffEnvelopeFiles(handoffRoot, "outbox")
    .map((filePath) => {
      try {
        return readHandoffEnvelope(filePath);
      } catch {
        return null;
      }
    })
    .filter((envelope): envelope is HandoffEnvelope => envelope?.type === "audit.result");

  for (const envelope of outboxResults) {
    const requestId = envelope.publicFields.request;
    if (!requestId) continue;
    const request = getNasHandoffRequest(requestId);
    if (!request || request.status !== "queued") continue;
    const status = resultStatus(envelope.publicFields.result, envelope.status);
    const summary = envelope.publicFields.summary ?? envelope.publicSummary;
    updateNasHandoffRequestResult(
      requestId,
      status,
      summary,
      envelope.createdAt,
    );
    closeNasLinkedAuditJob(request, status, summary, envelope.createdAt);
    recordOperatorEvent({ kind: "task", status: `nas-result-${status}`, channelId: request.channel_id }, repoRoot);
  }

  const rows = listNasHandoffRequests(channelId, limit)
    .map((request) => {
      const summary = sanitizePublicText(request.result_summary ?? "waiting", 120) || "waiting";
      return `- request ${request.id.slice(0, 12)} check=${request.check_name} status=${request.status} summary=${summary}`;
    });

  return [
    "**NAS Handoff Results**",
    "```text",
    rows.length > 0 ? rows.join("\n") : "INFO no audit result messages in outbox",
    "```",
  ].join("\n");
}

function normalizeRequestStatusFilter(value: string | null): NasHandoffRequestStatusFilter {
  if (value === "queued" || value === "completed" || value === "failed" || value === "all") {
    return value;
  }
  return "all";
}

export function buildNasRequestsReport(
  channelId: string,
  status: NasHandoffRequestStatusFilter = "all",
  limit = 5,
  repoRoot?: string,
): string {
  expireStaleNasHandoffRequestsForChannel(channelId);
  const rows = listNasHandoffRequestsByStatus(channelId, status, limit)
    .map((request) => {
      const summary = sanitizePublicText(request.result_summary ?? "waiting", 100) || "waiting";
      const mailbox = repoRoot ? ` mailbox=${requestMailboxLocation(repoRoot, request.id)}` : "";
      return [
        `- request ${request.id.slice(0, 12)}`,
        `check=${sanitizePublicText(request.check_name, 40) || "unknown"}`,
        `status=${request.status}`,
        requestAgeLine(request.created_at, request.updated_at),
        `summary=${summary}${mailbox}`,
      ].join(" ");
    });

  return [
    "**NAS Handoff Requests**",
    "```text",
    `filter=${status}`,
    rows.length > 0 ? rows.join("\n") : "INFO no tracked NAS handoff requests",
    "```",
  ].join("\n");
}

function requestStatusRow(request: ReturnType<typeof findNasHandoffRequestsByIdPrefix>[number]): string[] {
  const summary = sanitizePublicText(request.result_summary ?? "waiting", 180) || "waiting";
  return [
    `request=${request.id.slice(0, 24)}`,
    `project=${sanitizePublicText(request.project_label, 80) || "unknown"}`,
    `check=${sanitizePublicText(request.check_name, 40) || "unknown"}`,
    `status=${request.status}`,
    requestAgeLine(request.created_at, request.updated_at),
    `summary=${summary}`,
  ];
}

type RequestMailboxLocation = "inbox" | "outbox" | "archive" | "missing" | "unavailable" | "invalid";

function requestMailboxLocation(repoRoot: string, requestId: string): RequestMailboxLocation {
  const handoffRoot = readHandoffRootFromWorkerEnv(repoRoot);
  if (!handoffRoot || !fs.existsSync(handoffRoot)) return "unavailable";

  let sawInvalid = false;
  for (const box of ["inbox", "outbox", "archive"] as const) {
    for (const filePath of listHandoffEnvelopeFiles(handoffRoot, box)) {
      try {
        const envelope = readHandoffEnvelope(filePath);
        if (envelope.id === requestId || envelope.publicFields.request === requestId) {
          return box;
        }
      } catch {
        sawInvalid = true;
      }
    }
  }

  return sawInvalid ? "invalid" : "missing";
}

function normalizeHandoffBox(value: string | null): HandoffBox {
  if (value === "inbox" || value === "outbox" || value === "archive") return value;
  return "outbox";
}

function envelopeAgeLine(createdAt: string, now = new Date()): string {
  const createdTime = Date.parse(createdAt);
  if (!Number.isFinite(createdTime)) return "age=unknown";
  return `age=${Math.max(0, Math.floor((now.getTime() - createdTime) / 60_000))}m`;
}

function mailboxEnvelopeRow(envelope: HandoffEnvelope): string {
  const check = sanitizePublicText(envelope.publicFields.check ?? "unknown", 40) || "unknown";
  const request = sanitizePublicText(envelope.publicFields.request ?? envelope.id, 80) || envelope.id;
  const summary = sanitizePublicText(envelope.publicFields.summary ?? envelope.publicSummary, 100) || "none";
  return [
    `- ${envelope.id.slice(0, 24)}`,
    `type=${envelope.type}`,
    `status=${envelope.status}`,
    `check=${check}`,
    `request=${request.slice(0, 24)}`,
    envelopeAgeLine(envelope.createdAt),
    `summary=${summary}`,
  ].join(" ");
}

export function buildNasMailboxReport(repoRoot: string, box: HandoffBox, limit = 5): string {
  const safeLimit = Math.max(1, Math.min(10, Math.trunc(limit)));
  const handoffRoot = readHandoffRootFromWorkerEnv(repoRoot);
  if (!handoffRoot || !fs.existsSync(handoffRoot)) {
    return [
      "**NAS Handoff Mailbox**",
      "```text",
      `box=${box}`,
      "INFO handoff mailbox unavailable to bot process",
      "```",
    ].join("\n");
  }

  const rows: string[] = [];
  let invalidMessages = 0;
  for (const filePath of listHandoffEnvelopeFiles(handoffRoot, box).slice(-safeLimit).reverse()) {
    try {
      rows.push(mailboxEnvelopeRow(readHandoffEnvelope(filePath)));
    } catch {
      invalidMessages += 1;
    }
  }

  return [
    "**NAS Handoff Mailbox**",
    "```text",
    `box=${box}`,
    `invalid=${invalidMessages}`,
    rows.length > 0 ? rows.join("\n") : "INFO no readable handoff messages",
    "```",
  ].join("\n");
}

export function buildNasMailboxStatusReport(repoRoot: string, channelId: string): string {
  expireStaleNasHandoffRequestsForChannel(channelId, new Date(), repoRoot);
  const handoffRoot = readHandoffRootFromWorkerEnv(repoRoot);
  if (!handoffRoot || !fs.existsSync(handoffRoot)) {
    return [
      "**NAS Handoff Mailbox Status**",
      "```text",
      "INFO handoff mailbox unavailable to bot process",
      `tracked=${requestTrackingLine(channelId).replace(/^[A-Z]+ request tracking: /, "")}`,
      "```",
    ].join("\n");
  }

  const store = readPublicHandoffStore(handoffRoot);
  const boxCounts = store.boxes
    .map((box) => `${box.box}:${box.validMessages}`)
    .join(" ");
  const invalidCounts = store.boxes
    .map((box) => `${box.box}:${box.invalidMessages}`)
    .join(" ");

  let pendingResults = 0;
  let orphanResults = 0;
  for (const filePath of listHandoffEnvelopeFiles(handoffRoot, "outbox")) {
    try {
      const envelope = readHandoffEnvelope(filePath);
      if (envelope.type !== "audit.result") continue;
      const requestId = envelope.publicFields.request;
      if (!requestId) continue;
      const tracked = getNasHandoffRequest(requestId);
      if (!tracked) {
        orphanResults += 1;
      } else if (tracked.status === "queued") {
        pendingResults += 1;
      }
    } catch {
      continue;
    }
  }

  const queuedRequests = listNasHandoffRequestsByStatus(channelId, "queued", 10);
  const queuedMissing = queuedRequests
    .filter((request) => requestMailboxLocation(repoRoot, request.id) === "missing")
    .length;

  return [
    "**NAS Handoff Mailbox Status**",
    "```text",
    `root=${store.rootStatus}`,
    `boxes=${boxCounts}`,
    `invalid=${invalidCounts}`,
    `tracked=${requestTrackingLine(channelId).replace(/^[A-Z]+ request tracking: /, "")}`,
    `pending-results=${pendingResults}`,
    `orphan-results=${orphanResults}`,
    `queued-missing=${queuedMissing}`,
    "```",
  ].join("\n");
}

export function buildNasRequestStatusReport(channelId: string, requestPrefix: string, repoRoot?: string): string {
  expireStaleNasHandoffRequestsForChannel(channelId);
  const prefix = sanitizePublicText(requestPrefix, 80).replace(/[^a-zA-Z0-9._:-]/g, "");
  if (prefix.length < 4) {
    return "**NAS Handoff Request**\n```text\nFAIL request prefix too short\n```";
  }

  const matches = findNasHandoffRequestsByIdPrefix(channelId, prefix, 6);
  if (matches.length === 0) {
    return "**NAS Handoff Request**\n```text\nINFO no tracked request matched\n```";
  }
  if (matches.length > 1) {
    const rows = matches.slice(0, 5).map((request) => `- ${request.id.slice(0, 24)} status=${request.status}`);
    return [
      "**NAS Handoff Request**",
      "```text",
      "INFO request prefix is ambiguous",
      ...rows,
      "```",
    ].join("\n");
  }

  return [
    "**NAS Handoff Request**",
    "```text",
    ...requestStatusRow(matches[0]),
    ...(repoRoot ? [`mailbox=${requestMailboxLocation(repoRoot, matches[0].id)}`] : []),
    "```",
  ].join("\n");
}

async function executeRequest(interaction: ChatInputCommandInteraction, repoRoot: string): Promise<void> {
  const config = getConfig();
  if (!config.DISCORD_ENABLE_NAS_HANDOFF) {
    await interaction.editReply({
      content: L("`/nas request` is disabled. Set `DISCORD_ENABLE_NAS_HANDOFF=true` in `.env` to enable it.", "A `/nas request` ki van kapcsolva."),
    });
    return;
  }

  const project = getProject(interaction.channelId);
  if (!project) {
    await interaction.editReply({
      content: L("This channel is not registered to any project.", "Ez a csatorna nincs projekthez regisztrálva."),
    });
    return;
  }

  const activeJob = getActiveAuditJobByProjectPath(project.guild_id, project.project_path);
  if (activeJob) {
    await interaction.editReply({
      content: `An audit job is already active for this project: \`${activeJob.id.slice(0, 8)}...\` status=${activeJob.status}.`,
    });
    return;
  }

  const requestedCheck = interaction.options.getString("check", true);
  if (!isAuditCheckName(requestedCheck)) {
    await interaction.editReply({ content: `Unsupported NAS handoff check: \`${requestedCheck}\`` });
    return;
  }

  const handoffRoot = readHandoffRootFromWorkerEnv(repoRoot);
  if (!handoffRoot || !fs.existsSync(handoffRoot)) {
    await interaction.editReply({
      content: "NAS handoff root is not reachable from the bot process.",
    });
    return;
  }

  try {
    const projectLabel = projectFolderLabel(project.project_path);
    const envelope = createAuditRequestHandoff({
      projectLabel,
      checkName: requestedCheck,
    });
    writeHandoffEnvelope(handoffRoot, "inbox", envelope);
    const now = envelope.createdAt;
    const auditJobId = createNasLinkedAuditJob(interaction.channelId, projectLabel, requestedCheck, now);
    createNasHandoffRequest({
      id: envelope.id,
      channelId: interaction.channelId,
      auditJobId,
      projectLabel,
      checkName: requestedCheck,
      status: "queued",
      resultSummary: null,
      createdAt: now,
      updatedAt: now,
    });
    recordOperatorEvent({ kind: "task", status: "nas-request-queued", channelId: interaction.channelId }, repoRoot);
    await interaction.editReply({
      content: `Queued NAS audit request \`${envelope.id.slice(0, 8)}...\` for check \`${requestedCheck}\` as audit job \`${auditJobId.slice(0, 8)}...\`.`,
    });
  } catch {
    await interaction.editReply({
      content: "Failed to queue NAS audit request.",
    });
  }
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "worker-status") {
    const { job, created } = createOrGetBotOpsJob({
      requested_by: interaction.user.id,
      target: "nas",
      capability: "nas.worker.check",
      summary: "NAS fixed worker health check",
    });
    const heartbeats = listBotOpsWorkerHeartbeats("nas");

    await interaction.editReply({
      content: [
        created ? "**NAS worker check queued**" : "**NAS worker check already exists**",
        "```text",
        formatBotOpsJobDetails(job),
        "",
        formatBotOpsWorkerHeartbeats(heartbeats),
        "```",
        "No NAS shell or deploy action was executed directly from Discord.",
      ].join("\n"),
    });
    return;
  }

  if (subcommand === "worker-deploy-verify") {
    const { job, created } = createOrGetBotOpsJob({
      requested_by: interaction.user.id,
      target: "nas",
      capability: "nas.deploy.verify",
      summary: "NAS fixed deploy verifier request",
      expected_action: "run the read-only NAS deploy verifier",
      validation_condition: "NAS deploy verifier reports the expected build identity and health",
    });
    const heartbeats = listBotOpsWorkerHeartbeats("nas");

    await interaction.editReply({
      content: [
        created ? "**NAS deploy verifier job queued**" : "**NAS deploy verifier job already exists**",
        "```text",
        formatBotOpsJobDetails(job),
        "",
        formatBotOpsWorkerHeartbeats(heartbeats),
        "```",
        "No verifier was executed directly from Discord. Approval is required before the worker can run it.",
      ].join("\n"),
    });
    return;
  }

  if (subcommand === "deploy-apply") {
    const { job, created } = createOrGetBotOpsJob({
      requested_by: interaction.user.id,
      target: "nas",
      capability: "nas.deploy.apply",
      summary: "NAS fixed deploy apply request",
      expected_action: "run the fixed NAS deploy apply helper and post-deploy verifier",
      validation_condition: "deploy apply exits successfully and NAS deploy verifier passes afterwards",
    });
    const heartbeats = listBotOpsWorkerHeartbeats("nas");

    await interaction.editReply({
      content: [
        created ? "**NAS deploy apply job queued**" : "**NAS deploy apply job already exists**",
        "```text",
        formatBotOpsJobDetails(job),
        "",
        formatBotOpsWorkerHeartbeats(heartbeats),
        "```",
        "No deploy was executed directly from Discord. Review `/ops preview`, then approve explicitly with `/ops approve`.",
      ].join("\n"),
    });
    return;
  }

  if (subcommand === "bridge") {
    const config = getConfig();
    if (!config.DISCORD_ENABLE_NAS_BRIDGE_LIFECYCLE) {
      await interaction.editReply({
        content: L("`/nas bridge` is disabled. Set `DISCORD_ENABLE_NAS_BRIDGE_LIFECYCLE=true` in `.env` to enable it.", "A `/nas bridge` ki van kapcsolva."),
      });
      return;
    }

    const action = interaction.options.getString("action", true);
    if (!["status", "start", "stop", "restart"].includes(action)) {
      await interaction.editReply({ content: "Unsupported NAS bridge lifecycle action." });
      return;
    }

    await interaction.editReply({
      content: await buildNasBridgeLifecycleReport(process.cwd(), action as NasBridgeAction),
    });
    if (action !== "status") {
      recordOperatorEvent({ kind: "lifecycle", status: `nas-bridge-${action}`, channelId: interaction.channelId });
    }
    return;
  }

  if (subcommand === "smoke") {
    const config = getConfig();
    if (!config.DISCORD_ENABLE_NAS_BRIDGE_SMOKE) {
      await interaction.editReply({
        content: L("`/nas smoke` is disabled. Set `DISCORD_ENABLE_NAS_BRIDGE_SMOKE=true` in `.env` to enable it.", "A `/nas smoke` ki van kapcsolva."),
      });
      return;
    }

    const content = await buildNasBridgeSmokeReport(process.cwd());
    await interaction.editReply({ content });
    recordOperatorEvent({
      kind: "task",
      status: content.includes("OK smoke completed") ? "nas-bridge-smoke-passed" : "nas-bridge-smoke-failed",
      channelId: interaction.channelId,
    });
    return;
  }

  if (subcommand === "sync-status") {
    const config = getConfig();
    if (!config.DISCORD_ENABLE_NAS_SYNC_STATUS) {
      await interaction.editReply({
        content: L("`/nas sync-status` is disabled. Set `DISCORD_ENABLE_NAS_SYNC_STATUS=true` in `.env` to enable it.", "A `/nas sync-status` ki van kapcsolva."),
      });
      return;
    }

    await interaction.editReply({
      content: await buildNasSyncStatusReport(process.cwd()),
    });
    return;
  }

  if (subcommand === "deploy-status") {
    if (!getConfig().DISCORD_ENABLE_NAS_STATUS) {
      await interaction.editReply({
        content: L("`/nas deploy-status` is disabled. Set `DISCORD_ENABLE_NAS_STATUS=true` in `.env` to enable it.", "A `/nas deploy-status` ki van kapcsolva."),
      });
      return;
    }

    await interaction.editReply({
      content: buildNasDeployStatusReport(process.cwd()),
    });
    return;
  }

  if (subcommand === "deploy-plan") {
    if (!getConfig().DISCORD_ENABLE_NAS_STATUS) {
      await interaction.editReply({
        content: L("`/nas deploy-plan` is disabled. Set `DISCORD_ENABLE_NAS_STATUS=true` in `.env` to enable it.", "A `/nas deploy-plan` ki van kapcsolva."),
      });
      return;
    }

    await interaction.editReply({
      content: await buildNasDeployPlanReport(process.cwd()),
    });
    return;
  }

  if (subcommand === "rollback-plan") {
    if (!getConfig().DISCORD_ENABLE_NAS_STATUS) {
      await interaction.editReply({
        content: L("`/nas rollback-plan` is disabled. Set `DISCORD_ENABLE_NAS_STATUS=true` in `.env` to enable it.", "A `/nas rollback-plan` ki van kapcsolva."),
      });
      return;
    }

    await interaction.editReply({
      content: await buildNasRollbackPlanReport(process.cwd(), interaction.options.getString("commit")),
    });
    return;
  }

  if (subcommand === "handoff-gate") {
    if (!getConfig().DISCORD_ENABLE_NAS_STATUS) {
      await interaction.editReply({
        content: L("`/nas handoff-gate` is disabled. Set `DISCORD_ENABLE_NAS_STATUS=true` in `.env` to enable it.", "A `/nas handoff-gate` ki van kapcsolva."),
      });
      return;
    }

    await interaction.editReply({
      content: `**NAS Handoff Gate**\n\`\`\`text\n${renderNasHandoffGateReport()}\n\`\`\``,
    });
    return;
  }

  if (subcommand === "container-status") {
    if (!getConfig().DISCORD_ENABLE_NAS_STATUS) {
      await interaction.editReply({
        content: L("`/nas container-status` is disabled. Set `DISCORD_ENABLE_NAS_STATUS=true` in `.env` to enable it.", "A `/nas container-status` ki van kapcsolva."),
      });
      return;
    }

    await interaction.editReply({
      content: await buildNasContainerStatusReport(process.cwd()),
    });
    return;
  }

  if (subcommand === "request") {
    await executeRequest(interaction, process.cwd());
    return;
  }

  if (subcommand === "doctor") {
    if (!getConfig().DISCORD_ENABLE_NAS_STATUS) {
      await interaction.editReply({
        content: L("`/nas doctor` is disabled. Set `DISCORD_ENABLE_NAS_STATUS=true` in `.env` to enable it.", "A `/nas doctor` ki van kapcsolva."),
      });
      return;
    }
    await interaction.editReply({
      content: await buildNasDoctorReport(process.cwd(), interaction.channelId),
    });
    return;
  }

  if (subcommand === "results") {
    if (!getConfig().DISCORD_ENABLE_NAS_STATUS) {
      await interaction.editReply({
        content: L("`/nas results` is disabled. Set `DISCORD_ENABLE_NAS_STATUS=true` in `.env` to enable it.", "A `/nas results` ki van kapcsolva."),
      });
      return;
    }
    await interaction.editReply({
      content: buildNasResultsReport(process.cwd(), interaction.channelId, interaction.options.getInteger("limit") ?? 5),
    });
    return;
  }

  if (subcommand === "requests") {
    if (!getConfig().DISCORD_ENABLE_NAS_STATUS) {
      await interaction.editReply({
        content: L("`/nas requests` is disabled. Set `DISCORD_ENABLE_NAS_STATUS=true` in `.env` to enable it.", "A `/nas requests` ki van kapcsolva."),
      });
      return;
    }
    await interaction.editReply({
      content: buildNasRequestsReport(
        interaction.channelId,
        normalizeRequestStatusFilter(interaction.options.getString("status")),
        interaction.options.getInteger("limit") ?? 5,
        process.cwd(),
      ),
    });
    return;
  }

  if (subcommand === "request-status") {
    if (!getConfig().DISCORD_ENABLE_NAS_STATUS) {
      await interaction.editReply({
        content: L("`/nas request-status` is disabled. Set `DISCORD_ENABLE_NAS_STATUS=true` in `.env` to enable it.", "A `/nas request-status` ki van kapcsolva."),
      });
      return;
    }
    await interaction.editReply({
      content: buildNasRequestStatusReport(
        interaction.channelId,
        interaction.options.getString("request", true),
        process.cwd(),
      ),
    });
    return;
  }

  if (subcommand === "mailbox") {
    if (!getConfig().DISCORD_ENABLE_NAS_STATUS) {
      await interaction.editReply({
        content: L("`/nas mailbox` is disabled. Set `DISCORD_ENABLE_NAS_STATUS=true` in `.env` to enable it.", "A `/nas mailbox` ki van kapcsolva."),
      });
      return;
    }
    await interaction.editReply({
      content: buildNasMailboxReport(
        process.cwd(),
        normalizeHandoffBox(interaction.options.getString("box", true)),
        interaction.options.getInteger("limit") ?? 5,
      ),
    });
    return;
  }

  if (subcommand === "mailbox-status") {
    if (!getConfig().DISCORD_ENABLE_NAS_STATUS) {
      await interaction.editReply({
        content: L("`/nas mailbox-status` is disabled. Set `DISCORD_ENABLE_NAS_STATUS=true` in `.env` to enable it.", "A `/nas mailbox-status` ki van kapcsolva."),
      });
      return;
    }
    await interaction.editReply({
      content: buildNasMailboxStatusReport(process.cwd(), interaction.channelId),
    });
    return;
  }

  if (!getConfig().DISCORD_ENABLE_NAS_STATUS) {
    await interaction.editReply({
      content: L("`/nas` is disabled. Set `DISCORD_ENABLE_NAS_STATUS=true` in `.env` to enable it.", "A `/nas` ki van kapcsolva."),
    });
    return;
  }

  await interaction.editReply({
    content: await buildNasStatusReport(process.cwd(), interaction.channelId),
  });
}
