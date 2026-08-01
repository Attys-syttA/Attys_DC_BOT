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
  createNasHandoffRequest,
  getNasHandoffRequest,
  getProject,
  listNasHandoffRequests,
  updateNasHandoffRequestResult,
} from "../../db/database.js";
import {
  listHandoffEnvelopeFiles,
  readHandoffEnvelope,
  writeHandoffEnvelope,
  type HandoffEnvelope,
} from "../../nas/handoff-store.js";
import { getConfig } from "../../utils/config.js";
import { L } from "../../utils/i18n.js";
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
      )));

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

function resultStatus(value: string | undefined, fallback: HandoffEnvelope["status"]): "completed" | "failed" {
  if (value === "passed") return "completed";
  if (value === "failed") return "failed";
  return fallback === "completed" ? "completed" : "failed";
}

export async function buildNasStatusReport(repoRoot: string): Promise<string> {
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

export function buildNasResultsReport(repoRoot: string, channelId: string, limit = 5): string {
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
    if (!requestId || !getNasHandoffRequest(requestId)) continue;
    updateNasHandoffRequestResult(
      requestId,
      resultStatus(envelope.publicFields.result, envelope.status),
      envelope.publicFields.summary ?? envelope.publicSummary,
      envelope.createdAt,
    );
  }

  const rows = listNasHandoffRequests(channelId, limit)
    .map((request) => {
      const summary = request.result_summary ?? "waiting";
      return `- request ${request.id.slice(0, 12)} check=${request.check_name} status=${request.status} summary=${summary}`;
    });

  return [
    "**NAS Handoff Results**",
    "```text",
    rows.length > 0 ? rows.join("\n") : "INFO no audit result messages in outbox",
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

  if (!getConfig().DISCORD_ENABLE_NAS_STATUS) {
    await interaction.editReply({
      content: L("`/nas` is disabled. Set `DISCORD_ENABLE_NAS_STATUS=true` in `.env` to enable it.", "A `/nas` ki van kapcsolva."),
    });
    return;
  }

  await interaction.editReply({
    content: await buildNasStatusReport(process.cwd()),
  });
}
