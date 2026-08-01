import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { isAuditCheckName, type AuditCheckName } from "../../audit/check-catalog.js";
import { runAuditCheckPipeline, type AuditCheckRunResult } from "../../audit/check-runner.js";
import {
  assertAuditModeAllowsCapabilities,
  defaultAuditCapabilities,
  isTerminalAuditStatus,
} from "../../audit/types.js";
import {
  createAuditJob,
  getActiveAuditJob,
  getActiveAuditJobByProjectPath,
  getAuditJob,
  getLatestAuditJob,
  getProject,
  insertAuditStepResult,
  listAuditSteps,
  requestAuditJobStop,
  updateAuditJobProgress,
} from "../../db/database.js";
import type { AuditJobRecord, AuditStepRecord } from "../../db/types.js";
import { getConfig } from "../../utils/config.js";
import { L } from "../../utils/i18n.js";
import { sanitizePublicFileLabel } from "../../utils/public-safety.js";
import { recordOperatorEvent } from "../operator-events.js";

export const data = new SlashCommandBuilder()
  .setName("audit")
  .setDescription("Run fixed read-only audit checks for the registered project")
  .addSubcommand((subcommand) => subcommand
    .setName("start")
    .setDescription("Start a fixed read-only audit check")
    .addStringOption((option) => option
      .setName("check")
      .setDescription("Named check to run")
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
    .setName("status")
    .setDescription("Show the latest audit status for this channel"))
  .addSubcommand((subcommand) => subcommand
    .setName("stop")
    .setDescription("Request stop for the active audit job"))
  .addSubcommand((subcommand) => subcommand
    .setName("repair")
    .setDescription("Request explicit approval for an isolated repair attempt"));

const activeAuditControllers = new Map<string, AbortController>();

function renderStep(step: AuditStepRecord): string {
  const exit = step.exit_code === null ? "n/a" : String(step.exit_code);
  return `- ${step.step_name}: ${step.status} exit=${exit} duration=${step.duration_ms}ms`;
}

function renderAuditJob(job: AuditJobRecord, steps: AuditStepRecord[]): string {
  const lines = [
    `job: \`${job.id.slice(0, 8)}...\``,
    `project: \`${job.project_label}\``,
    `mode: ${job.mode}`,
    `status: ${job.status}`,
    `current step: ${job.current_step ?? "none"}`,
    `iteration: ${job.iteration}/${job.max_iterations}`,
    `stop requested: ${job.stop_requested === 1 ? "yes" : "no"}`,
  ];

  if (steps.length > 0) {
    lines.push("", "steps:", ...steps.map(renderStep));
  }

  return lines.join("\n");
}

function finalStatusFromSteps(steps: AuditStepRecord[]): AuditJobRecord["status"] {
  if (steps.some((step) => step.status === "stopped")) return "stopped";
  return steps.every((step) => step.status === "passed") ? "completed" : "waiting_manual_review";
}

async function executeStart(interaction: ChatInputCommandInteraction): Promise<void> {
  const config = getConfig();
  if (!config.DISCORD_ENABLE_AUDIT) {
    await interaction.editReply({
      content: L("`/audit` is disabled. Set `DISCORD_ENABLE_AUDIT=true` in `.env` to enable it.", "A `/audit` ki van kapcsolva."),
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
      content: `An audit job is already active for this project.\n\`\`\`text\n${renderAuditJob(activeJob, listAuditSteps(activeJob.id))}\n\`\`\``,
    });
    return;
  }

  const requestedCheck = interaction.options.getString("check", true);
  if (!isAuditCheckName(requestedCheck)) {
    await interaction.editReply({ content: `Unsupported audit check: \`${requestedCheck}\`` });
    return;
  }

  const now = new Date().toISOString();
  const jobId = randomUUID();
  const capabilities = defaultAuditCapabilities("check-only");
  assertAuditModeAllowsCapabilities("check-only", capabilities);
  createAuditJob({
    id: jobId,
    channelId: interaction.channelId,
    projectLabel: sanitizePublicFileLabel(project.project_path),
    mode: "check-only",
    status: "running_checks",
    currentStep: requestedCheck,
    iteration: 0,
    maxIterations: 2,
    stopRequested: false,
    capabilities,
    createdAt: now,
    updatedAt: now,
  });
  recordOperatorEvent({ kind: "task", status: "audit-started", channelId: interaction.channelId });

  await interaction.editReply({
    content: `Starting read-only audit check \`${requestedCheck}\` for \`${sanitizePublicFileLabel(project.project_path)}\`...`,
  });

  const controller = new AbortController();
  activeAuditControllers.set(jobId, controller);
  let results;
  try {
    results = await runAuditCheckPipeline(project.project_path, requestedCheck as AuditCheckName, {
      signal: controller.signal,
      shouldStop: () => getAuditJob(jobId)?.stop_requested === 1,
    });
  } catch {
    updateAuditJobProgress(jobId, "failed", null, 0, new Date().toISOString());
    recordOperatorEvent({ kind: "task", status: "audit-failed", channelId: interaction.channelId });
    await interaction.followUp({
      content: `**Audit failed**\n\`\`\`text\njob: ${jobId.slice(0, 8)}...\nstatus: failed\nreason: check runner error\n\`\`\``,
    });
    return;
  } finally {
    activeAuditControllers.delete(jobId);
  }
    for (const result of results) {
      insertAuditStepResult(jobId, result);
      recordAuditStepEvent(result, interaction.channelId);
    }

  const storedSteps = listAuditSteps(jobId);
  const finalStatus = finalStatusFromSteps(storedSteps);
  updateAuditJobProgress(jobId, finalStatus, null, 0, new Date().toISOString());
  recordOperatorEvent({
    kind: "task",
    status: finalStatus === "completed" ? "audit-completed" : "audit-manual-review",
    channelId: interaction.channelId,
  });

  const job = getLatestAuditJob(interaction.channelId);
  await interaction.followUp({
    content: `**Audit ${finalStatus}**\n\`\`\`text\n${renderAuditJob(job!, storedSteps)}\n\`\`\``,
  });
}

function recordAuditStepEvent(result: AuditCheckRunResult, channelId: string): void {
  const normalizedStatus = result.status.replace(/_/g, "-");
  recordOperatorEvent({ kind: "task", status: `audit-check-${normalizedStatus}`, channelId });
}

async function executeStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  const job = getLatestAuditJob(interaction.channelId);
  if (!job) {
    await interaction.editReply({ content: "No audit job has been recorded for this channel yet." });
    return;
  }

  await interaction.editReply({
    content: `**Latest audit job**\n\`\`\`text\n${renderAuditJob(job, listAuditSteps(job.id))}\n\`\`\``,
  });
}

async function executeStop(interaction: ChatInputCommandInteraction): Promise<void> {
  const job = getActiveAuditJob(interaction.channelId);
  if (!job) {
    await interaction.editReply({ content: "No active audit job exists for this channel." });
    return;
  }

  if (isTerminalAuditStatus(job.status)) {
    await interaction.editReply({ content: "The latest audit job is already terminal." });
    return;
  }

  requestAuditJobStop(job.id, new Date().toISOString());
  const controller = activeAuditControllers.get(job.id);
  controller?.abort();
  recordOperatorEvent({ kind: "task", status: "audit-stop-requested", channelId: interaction.channelId });
  await interaction.editReply({
    content: controller
      ? `Stop requested for audit job \`${job.id.slice(0, 8)}...\`; running process abort requested.`
      : `Stop requested for audit job \`${job.id.slice(0, 8)}...\`.`,
  });
}

async function executeRepair(interaction: ChatInputCommandInteraction): Promise<void> {
  const config = getConfig();
  if (!config.DISCORD_ENABLE_AUDIT_REPAIR) {
    await interaction.editReply({
      content: "`/audit repair` is disabled. Set `DISCORD_ENABLE_AUDIT_REPAIR=true` in `.env` to enable it.",
    });
    return;
  }

  const job = getLatestAuditJob(interaction.channelId);
  if (!job) {
    await interaction.editReply({ content: "No audit job has been recorded for this channel yet." });
    return;
  }

  if (job.status !== "waiting_manual_review" && job.status !== "waiting_repair_approval") {
    await interaction.editReply({
      content: `Audit job \`${job.id.slice(0, 8)}...\` is not waiting for repair approval.`,
    });
    return;
  }

  updateAuditJobProgress(job.id, "waiting_repair_approval", null, job.iteration, new Date().toISOString());
  recordOperatorEvent({ kind: "task", status: "audit-repair-waiting", channelId: interaction.channelId });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`audit-repair-approve:${job.id}`)
      .setLabel("Approve isolated repair")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`audit-repair-deny:${job.id}`)
      .setLabel("Keep manual review")
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({
    content: [
      `Repair approval requested for audit job \`${job.id.slice(0, 8)}...\`.`,
      "No repair, worktree, Codex turn, merge, commit, or push starts until the approval button is pressed.",
    ].join("\n"),
    components: [row],
  });
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "start") {
    await executeStart(interaction);
    return;
  }
  if (subcommand === "status") {
    await executeStatus(interaction);
    return;
  }
  if (subcommand === "stop") {
    await executeStop(interaction);
    return;
  }
  if (subcommand === "repair") {
    await executeRepair(interaction);
  }
}
