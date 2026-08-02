import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { isAuditCheckName, type AuditCheckName } from "../../audit/check-catalog.js";
import { hasMatchingPreviousFailure } from "../../audit/fingerprint.js";
import { createAuditRepairCodexStarter } from "../../audit/repair-codex-starter.js";
import { buildAuditRepairContract } from "../../audit/repair-contract.js";
import { startTrackedAuditRepairExecution } from "../../audit/repair-execution-tracker.js";
import { renderAuditRepairPlan } from "../../audit/repair-plan.js";
import { buildAuditRepairPrompt } from "../../audit/repair-prompt.js";
import { runAuditCheckPipeline, type AuditCheckRunResult } from "../../audit/check-runner.js";
import { inspectRepairWorktreeChanges } from "../../audit/worktree-manager.js";
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
  getAuditRepairWorktree,
  getLatestAuditJob,
  getProject,
  insertAuditStepResult,
  listAuditRepairExecutions,
  listAuditSteps,
  requestAuditJobStop,
  updateAuditRepairWorktreeStatus,
  updateAuditJobProgress,
} from "../../db/database.js";
import type { AuditJobRecord, AuditRepairExecutionRecord, AuditStepRecord } from "../../db/types.js";
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
    .setName("review")
    .setDescription("Show public-safe manual review guidance for the latest audit job"))
  .addSubcommand((subcommand) => subcommand
    .setName("repair-plan")
    .setDescription("Preview the public-safe contract for a future isolated repair"))
  .addSubcommand((subcommand) => subcommand
    .setName("stop")
    .setDescription("Request stop for the active audit job"))
  .addSubcommand((subcommand) => subcommand
    .setName("repair")
    .setDescription("Request explicit approval for an isolated repair attempt"))
  .addSubcommand((subcommand) => subcommand
    .setName("repair-run")
    .setDescription("Start one explicitly enabled isolated repair Codex turn"))
  .addSubcommand((subcommand) => subcommand
    .setName("recheck")
    .setDescription("Rerun the original named check in the isolated repair worktree"));

const activeAuditControllers = new Map<string, AbortController>();

function renderStep(step: AuditStepRecord): string {
  const exit = step.exit_code === null ? "n/a" : String(step.exit_code);
  return `- ${step.step_name}: ${step.status} exit=${exit} duration=${step.duration_ms}ms`;
}

function renderRepairExecution(execution: AuditRepairExecutionRecord): string {
  const thread = execution.thread_id ? execution.thread_id.slice(0, 12) : "none";
  const turn = execution.turn_id ? execution.turn_id.slice(0, 12) : "none";
  return `- ${execution.status}: thread=${thread} turn=${turn} summary=${execution.result_summary}`;
}

function renderAuditJob(job: AuditJobRecord, steps: AuditStepRecord[]): string {
  const lines = [
    `job: \`${job.id.slice(0, 8)}...\``,
    `project: \`${job.project_label}\``,
    `mode: ${job.mode}`,
    `status: ${job.status}`,
    `requested check: ${job.requested_check ?? "unknown"}`,
    `current step: ${job.current_step ?? "none"}`,
    `iteration: ${job.iteration}/${job.max_iterations}`,
    `stop requested: ${job.stop_requested === 1 ? "yes" : "no"}`,
  ];

  if (steps.length > 0) {
    lines.push("", "steps:", ...steps.map(renderStep));
  }

  const repairWorktree = getAuditRepairWorktree(job.id);
  if (repairWorktree) {
    lines.push(
      "",
      "repair worktree:",
      `- status: ${repairWorktree.status}`,
      `- branch: ${repairWorktree.branch_name}`,
      `- head: ${repairWorktree.head_commit.slice(0, 12)}`,
      `- changes: ${inspectRepairWorktreeChanges(repairWorktree.worktree_path).summary}`,
    );
  }

  const repairExecutions = listAuditRepairExecutions(job.id, 3);
  if (repairExecutions.length > 0) {
    lines.push("", "repair executions:", ...repairExecutions.map(renderRepairExecution));
  }

  return lines.join("\n");
}

function reviewDecisionLine(job: AuditJobRecord): string {
  if (job.status === "completed") return "decision: completed; no repair needed";
  if (job.status === "stagnated") return "decision: stagnated; manual review required";
  if (job.status === "waiting_manual_review") return "decision: manual review required";
  if (job.status === "waiting_repair_approval") return "decision: repair approval pending";
  if (job.status === "waiting_nas_result") return "decision: waiting for NAS result";
  if (isTerminalAuditStatus(job.status)) return `decision: terminal ${job.status}`;
  return `decision: active ${job.status}`;
}

function renderAuditReview(job: AuditJobRecord, steps: AuditStepRecord[]): string {
  const repairWorktree = getAuditRepairWorktree(job.id);
  const latestStep = steps.at(-1);
  const lines = [
    `job: \`${job.id.slice(0, 8)}...\``,
    `project: \`${job.project_label}\``,
    `status: ${job.status}`,
    `requested check: ${job.requested_check ?? "unknown"}`,
    `latest step: ${latestStep ? `${latestStep.step_name}:${latestStep.status}` : "none"}`,
    reviewDecisionLine(job),
  ];

  if (repairWorktree) {
    lines.push(
      `repair workspace: ${repairWorktree.status}`,
      `repair branch: ${repairWorktree.branch_name}`,
      `repair head: ${repairWorktree.head_commit.slice(0, 12)}`,
      `repair changes: ${inspectRepairWorktreeChanges(repairWorktree.worktree_path).summary}`,
    );
  } else {
    lines.push("repair workspace: none");
  }

  const repairExecutions = listAuditRepairExecutions(job.id, 1);
  if (repairExecutions.length > 0) {
    lines.push(`latest repair execution: ${renderRepairExecution(repairExecutions[0]).slice(2)}`);
  } else {
    lines.push("latest repair execution: none");
  }

  lines.push(
    "allowed next actions: /audit status, /audit repair, /audit recheck",
    "blocked actions: automatic merge, commit, push, source worktree write",
  );
  return lines.join("\n");
}

function finalStatusFromSteps(steps: AuditStepRecord[]): AuditJobRecord["status"] {
  if (steps.some((step) => step.status === "stopped")) return "stopped";
  return steps.every((step) => step.status === "passed") ? "completed" : "waiting_manual_review";
}

function finalStatusFromRunResults(
  results: AuditCheckRunResult[],
  previousSteps: AuditStepRecord[] = [],
): AuditJobRecord["status"] {
  if (results.some((result) => result.status === "stopped")) return "stopped";
  if (results.some((result) => hasMatchingPreviousFailure(previousSteps, result))) return "stagnated";
  return results.every((result) => result.status === "passed") ? "completed" : "waiting_manual_review";
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
    requestedCheck: requestedCheck,
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

async function executeReview(interaction: ChatInputCommandInteraction): Promise<void> {
  const job = getLatestAuditJob(interaction.channelId);
  if (!job) {
    await interaction.editReply({ content: "No audit job has been recorded for this channel yet." });
    return;
  }

  await interaction.editReply({
    content: `**Audit review**\n\`\`\`text\n${renderAuditReview(job, listAuditSteps(job.id))}\n\`\`\``,
  });
}

async function executeRepairPlan(interaction: ChatInputCommandInteraction): Promise<void> {
  const job = getLatestAuditJob(interaction.channelId);
  if (!job) {
    await interaction.editReply({ content: "No audit job has been recorded for this channel yet." });
    return;
  }

  const repairWorktree = getAuditRepairWorktree(job.id);
  const repairChangeSummary = repairWorktree
    ? inspectRepairWorktreeChanges(repairWorktree.worktree_path).summary
    : "unavailable";

  await interaction.editReply({
    content: `**Audit repair plan**\n\`\`\`text\n${renderAuditRepairPlan({
      job,
      steps: listAuditSteps(job.id),
      repairWorktree,
      repairChangeSummary,
    })}\n\`\`\``,
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

async function executeRecheck(interaction: ChatInputCommandInteraction): Promise<void> {
  const config = getConfig();
  if (!config.DISCORD_ENABLE_AUDIT_REPAIR) {
    await interaction.editReply({
      content: "`/audit recheck` is disabled. Set `DISCORD_ENABLE_AUDIT_REPAIR=true` in `.env` to enable it.",
    });
    return;
  }

  const job = getLatestAuditJob(interaction.channelId);
  if (!job) {
    await interaction.editReply({ content: "No audit job has been recorded for this channel yet." });
    return;
  }

  if (job.status !== "waiting_manual_review") {
    await interaction.editReply({
      content: `Audit job \`${job.id.slice(0, 8)}...\` is not waiting for isolated recheck.`,
    });
    return;
  }

  if (!job.requested_check || !isAuditCheckName(job.requested_check)) {
    await interaction.editReply({
      content: `Audit job \`${job.id.slice(0, 8)}...\` has no supported requested check to rerun.`,
    });
    return;
  }

  if (job.iteration >= job.max_iterations) {
    await interaction.editReply({
      content: `Audit job \`${job.id.slice(0, 8)}...\` has reached its recheck budget (${job.iteration}/${job.max_iterations}).`,
    });
    return;
  }

  const repairWorktree = getAuditRepairWorktree(job.id);
  if (!repairWorktree || (repairWorktree.status !== "prepared" && repairWorktree.status !== "retained")) {
    await interaction.editReply({
      content: `Audit job \`${job.id.slice(0, 8)}...\` has no prepared repair workspace to recheck.`,
    });
    return;
  }

  const nextIteration = job.iteration + 1;
  updateAuditJobProgress(job.id, "rechecking", job.requested_check, nextIteration, new Date().toISOString());
  recordOperatorEvent({ kind: "task", status: "audit-recheck-started", channelId: interaction.channelId });
  await interaction.editReply({
    content: `Rechecking \`${job.requested_check}\` in the isolated repair workspace for audit job \`${job.id.slice(0, 8)}...\`.`,
  });
  const previousSteps = listAuditSteps(job.id);

  const controller = new AbortController();
  activeAuditControllers.set(job.id, controller);
  let results: AuditCheckRunResult[];
  try {
    results = await runAuditCheckPipeline(repairWorktree.worktree_path, job.requested_check, {
      signal: controller.signal,
      shouldStop: () => getAuditJob(job.id)?.stop_requested === 1,
    });
  } catch {
    updateAuditJobProgress(job.id, "failed", null, nextIteration, new Date().toISOString());
    updateAuditRepairWorktreeStatus(job.id, "retained", new Date().toISOString());
    recordOperatorEvent({ kind: "task", status: "audit-recheck-failed", channelId: interaction.channelId });
    await interaction.followUp({
      content: `**Audit recheck failed**\n\`\`\`text\njob: ${job.id.slice(0, 8)}...\nstatus: failed\nreason: check runner error\nrepair workspace: retained\n\`\`\``,
    });
    return;
  } finally {
    activeAuditControllers.delete(job.id);
  }

  for (const result of results) {
    insertAuditStepResult(job.id, result);
    recordAuditStepEvent(result, interaction.channelId);
  }

  const finalStatus = finalStatusFromRunResults(results, previousSteps);
  updateAuditRepairWorktreeStatus(job.id, finalStatus === "completed" ? "prepared" : "retained", new Date().toISOString());
  updateAuditJobProgress(job.id, finalStatus, null, nextIteration, new Date().toISOString());
  recordOperatorEvent({
    kind: "task",
    status: finalStatus === "completed"
      ? "audit-recheck-completed"
      : finalStatus === "stagnated"
        ? "audit-stagnated"
        : "audit-recheck-manual-review",
    channelId: interaction.channelId,
  });

  const refreshedJob = getLatestAuditJob(interaction.channelId);
  await interaction.followUp({
    content: `**Audit recheck ${finalStatus}**\n\`\`\`text\n${renderAuditJob(refreshedJob!, listAuditSteps(job.id))}\n\`\`\``,
  });
}

async function executeRepairRun(interaction: ChatInputCommandInteraction): Promise<void> {
  const config = getConfig();
  if (!config.DISCORD_ENABLE_AUDIT_REPAIR) {
    await interaction.editReply({
      content: "`/audit repair-run` is disabled. Set `DISCORD_ENABLE_AUDIT_REPAIR=true` first.",
    });
    return;
  }
  if (!config.DISCORD_ENABLE_AUDIT_REPAIR_EXECUTION) {
    await interaction.editReply({
      content: [
        "`/audit repair-run` is disabled.",
        "Set `DISCORD_ENABLE_AUDIT_REPAIR_EXECUTION=true` only after reviewing `/audit repair-plan`.",
      ].join("\n"),
    });
    return;
  }

  const job = getLatestAuditJob(interaction.channelId);
  if (!job) {
    await interaction.editReply({ content: "No audit job has been recorded for this channel yet." });
    return;
  }
  if (job.status !== "waiting_manual_review") {
    await interaction.editReply({
      content: `Audit job \`${job.id.slice(0, 8)}...\` is not waiting for isolated repair execution.`,
    });
    return;
  }
  if (!job.requested_check || !isAuditCheckName(job.requested_check)) {
    await interaction.editReply({
      content: `Audit job \`${job.id.slice(0, 8)}...\` has no supported requested check for repair validation.`,
    });
    return;
  }

  const repairWorktree = getAuditRepairWorktree(job.id);
  if (!repairWorktree || (repairWorktree.status !== "prepared" && repairWorktree.status !== "retained")) {
    await interaction.editReply({
      content: `Audit job \`${job.id.slice(0, 8)}...\` has no prepared repair workspace to run.`,
    });
    return;
  }

  const steps = listAuditSteps(job.id);
  if (!steps.some((step) => step.status !== "passed")) {
    await interaction.editReply({
      content: `Audit job \`${job.id.slice(0, 8)}...\` has no failed or unsupported audit evidence to repair.`,
    });
    return;
  }

  const latestRepairExecution = listAuditRepairExecutions(job.id, 1).at(0);
  if (latestRepairExecution?.status === "started" && latestRepairExecution.iteration === job.iteration) {
    await interaction.editReply({
      content: `Audit job \`${job.id.slice(0, 8)}...\` already has a started repair execution for iteration ${job.iteration}; run /audit recheck before starting another one.`,
    });
    return;
  }

  const repairChangeSummary = inspectRepairWorktreeChanges(repairWorktree.worktree_path).summary;
  const contract = buildAuditRepairContract({
    job,
    steps,
    repairWorktree,
    repairChangeSummary,
  });
  const prompt = buildAuditRepairPrompt(contract);
  const executionId = randomUUID();

  updateAuditJobProgress(job.id, "repairing", "repair", job.iteration, new Date().toISOString());
  recordOperatorEvent({ kind: "task", status: "audit-repair-execution-starting", channelId: interaction.channelId });
  await interaction.editReply({
    content: `Starting one isolated Codex repair turn for audit job \`${job.id.slice(0, 8)}...\`.`,
  });

  try {
    const result = await startTrackedAuditRepairExecution({
      jobId: job.id,
      executionId,
      enabled: true,
      contract,
      prompt,
      worktreePath: repairWorktree.worktree_path,
      startCodexRepair: createAuditRepairCodexStarter(),
    });

    if (result.status !== "started") {
      updateAuditJobProgress(job.id, "waiting_manual_review", null, job.iteration, new Date().toISOString());
      recordOperatorEvent({ kind: "task", status: "audit-repair-execution-rejected", channelId: interaction.channelId });
      await interaction.followUp({
        content: `**Audit repair execution ${result.status}**\n\`\`\`text\njob: ${job.id.slice(0, 8)}...\nsummary: ${result.summary}\n\`\`\``,
      });
      return;
    }

    recordOperatorEvent({ kind: "task", status: "audit-repair-started", channelId: interaction.channelId });
    updateAuditJobProgress(job.id, "waiting_manual_review", null, job.iteration, new Date().toISOString());
    await interaction.followUp({
      content: [
        "**Audit repair execution started**",
        "```text",
        `job: ${job.id.slice(0, 8)}...`,
        `execution: ${executionId.slice(0, 8)}...`,
        `thread: ${result.threadId ? result.threadId.slice(0, 12) : "none"}`,
        `turn: ${result.turnId ? result.turnId.slice(0, 12) : "none"}`,
        "next: review Codex result, then run /audit recheck",
        "```",
      ].join("\n"),
    });
  } catch {
    updateAuditJobProgress(job.id, "waiting_manual_review", null, job.iteration, new Date().toISOString());
    recordOperatorEvent({ kind: "task", status: "audit-repair-execution-failed", channelId: interaction.channelId });
    await interaction.followUp({
      content: `**Audit repair execution failed**\n\`\`\`text\njob: ${job.id.slice(0, 8)}...\nstatus: failed\nrepair workspace: retained\n\`\`\``,
    });
  }
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
  if (subcommand === "review") {
    await executeReview(interaction);
    return;
  }
  if (subcommand === "repair-plan") {
    await executeRepairPlan(interaction);
    return;
  }
  if (subcommand === "stop") {
    await executeStop(interaction);
    return;
  }
  if (subcommand === "repair") {
    await executeRepair(interaction);
    return;
  }
  if (subcommand === "repair-run") {
    await executeRepairRun(interaction);
    return;
  }
  if (subcommand === "recheck") {
    await executeRecheck(interaction);
  }
}
