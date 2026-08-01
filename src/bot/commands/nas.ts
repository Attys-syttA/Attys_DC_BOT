import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { isAuditCheckName } from "../../audit/check-catalog.js";
import { createAuditRequestHandoff } from "../../nas/audit-handoff.js";
import { readPublicHandoffStore } from "../../nas/handoff-store.js";
import {
  countNasHandoffRequestsByStatus,
  createNasHandoffRequest,
  expireStaleNasHandoffRequests,
  getNasHandoffRequest,
  getProject,
  listNasHandoffRequests,
  listNasHandoffRequestsByStatus,
  updateNasHandoffRequestResult,
} from "../../db/database.js";
import type { NasHandoffRequestStatusFilter } from "../../db/types.js";
import {
  listHandoffEnvelopeFiles,
  readHandoffEnvelope,
  writeHandoffEnvelope,
  type HandoffEnvelope,
} from "../../nas/handoff-store.js";
import { verifyNasDeploy } from "../../nas/deploy-verification.js";
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
    .setDescription("Verify NAS deployed files against the running control-plane snapshot"));

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
    recordOperatorEvent({ kind: "task", status: "nas-request-timeout", channelId: request.channel_id }, repoRoot);
  }
  return expired.length;
}

function resultStatus(value: string | undefined, fallback: HandoffEnvelope["status"]): "completed" | "failed" {
  if (value === "passed") return "completed";
  if (value === "failed") return "failed";
  return fallback === "completed" ? "completed" : "failed";
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
  const result = await runLocalCommand(npmCommand(), ["run", "--silent", "nas:sync-share"], repoRoot, 60_000);
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
    updateNasHandoffRequestResult(
      requestId,
      status,
      envelope.publicFields.summary ?? envelope.publicSummary,
      envelope.createdAt,
    );
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

export function buildNasRequestsReport(channelId: string, status: NasHandoffRequestStatusFilter = "all", limit = 5): string {
  expireStaleNasHandoffRequestsForChannel(channelId);
  const rows = listNasHandoffRequestsByStatus(channelId, status, limit)
    .map((request) => {
      const summary = sanitizePublicText(request.result_summary ?? "waiting", 100) || "waiting";
      return [
        `- request ${request.id.slice(0, 12)}`,
        `check=${sanitizePublicText(request.check_name, 40) || "unknown"}`,
        `status=${request.status}`,
        requestAgeLine(request.created_at, request.updated_at),
        `summary=${summary}`,
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
    createNasHandoffRequest({
      id: envelope.id,
      channelId: interaction.channelId,
      projectLabel,
      checkName: requestedCheck,
      status: "queued",
      resultSummary: null,
      createdAt: now,
      updatedAt: now,
    });
    recordOperatorEvent({ kind: "task", status: "nas-request-queued", channelId: interaction.channelId }, repoRoot);
    await interaction.editReply({
      content: `Queued NAS audit request \`${envelope.id.slice(0, 8)}...\` for check \`${requestedCheck}\`.`,
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

  if (subcommand === "request") {
    await executeRequest(interaction, process.cwd());
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
      ),
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
