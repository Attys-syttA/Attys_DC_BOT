import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import {
  approveBotOpsJob,
  getBotOpsJob,
  listBotOpsJobEvents,
  listBotOpsJobs,
  listBotOpsWorkerHeartbeats,
  recoverBotOpsWaitingWorkerJob,
  updateBotOpsJobStatus,
} from "../../db/database.js";
import {
  buildBotOpsJobsReply,
  buildBotOpsStatusReply,
  formatBotOpsEventDetails,
  formatBotOpsJobDetails,
} from "../../botops/render.js";
import type { BotOpsJob } from "../../botops/contract.js";
import {
  formatWorkerSupervisorStatus,
  readWorkerSupervisorStatus,
} from "../../botops/worker-supervisor.js";

export function buildBotOpsWorkersReply(repoRoot: string): string {
  return [
    "**BotOps workers**",
    "```text",
    "mode: supervisor status only",
    "start/stop/restart from Discord: disabled",
    "",
    formatWorkerSupervisorStatus(readWorkerSupervisorStatus(repoRoot, "nas")),
    "",
    formatWorkerSupervisorStatus(readWorkerSupervisorStatus(repoRoot, "windows")),
    "```",
  ].join("\n");
}

export function buildBotOpsApproveReply(
  jobId: string,
  currentJob: BotOpsJob | undefined,
  approvedJob: BotOpsJob | undefined,
): string {
  if (!currentJob) {
    return `BotOps job \`${jobId}\` was not found.`;
  }

  if (currentJob.approval_state !== "required") {
    return [
      `BotOps job \`${jobId}\` was not approved: approval ${currentJob.approval_state}.`,
      "```text",
      formatBotOpsJobDetails(currentJob),
      "```",
    ].join("\n");
  }

  if (!approvedJob) {
    return [
      `BotOps job \`${jobId}\` was not approved: approval update failed.`,
      "```text",
      formatBotOpsJobDetails(currentJob),
      "```",
    ].join("\n");
  }

  return [
    "**BotOps approval recorded**",
    "```text",
    formatBotOpsJobDetails(approvedJob),
    "```",
    "No execution was started by this approval command.",
  ].join("\n");
}

export const data = new SlashCommandBuilder()
  .setName("ops")
  .setDescription("Inspect and approve staged BotOps jobs")
  .addSubcommand((subcommand) => subcommand
    .setName("status")
    .setDescription("Show staged BotOps control-plane status"))
  .addSubcommand((subcommand) => subcommand
    .setName("workers")
    .setDescription("Show read-only BotOps worker supervisor status"))
  .addSubcommand((subcommand) => subcommand
    .setName("jobs")
    .setDescription("List recent BotOps jobs")
    .addIntegerOption((option) => option
      .setName("limit")
      .setDescription("How many jobs to show")
      .setMinValue(1)
      .setMaxValue(25)))
  .addSubcommand((subcommand) => subcommand
    .setName("approve")
    .setDescription("Approve one waiting BotOps job without executing it directly")
    .addStringOption((option) => option
      .setName("job_id")
      .setDescription("BotOps job id")
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName("cancel")
    .setDescription("Cancel one BotOps job")
    .addStringOption((option) => option
      .setName("job_id")
      .setDescription("BotOps job id")
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName("recover")
    .setDescription("Requeue one lease-expired WaitingWorker BotOps job")
    .addStringOption((option) => option
      .setName("job_id")
      .setDescription("BotOps job id")
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName("preview")
    .setDescription("Preview exactly what one BotOps approval would allow")
    .addStringOption((option) => option
      .setName("job_id")
      .setDescription("BotOps job id")
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName("logs")
    .setDescription("Show public-safe details for one BotOps job")
    .addStringOption((option) => option
      .setName("job_id")
      .setDescription("BotOps job id")
      .setRequired(true)));

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const action = interaction.options.getSubcommand();

  if (action === "status") {
    await interaction.editReply({
      content: buildBotOpsStatusReply(listBotOpsJobs(25), listBotOpsWorkerHeartbeats()),
    });
    return;
  }

  if (action === "workers") {
    await interaction.editReply({ content: buildBotOpsWorkersReply(process.cwd()) });
    return;
  }

  if (action === "jobs") {
    const limit = interaction.options.getInteger("limit") ?? 10;
    await interaction.editReply({ content: buildBotOpsJobsReply(listBotOpsJobs(limit)) });
    return;
  }

  const jobId = interaction.options.getString("job_id", true);
  if (action === "preview") {
    const job = getBotOpsJob(jobId);
    await interaction.editReply({
      content: job
        ? `**BotOps approval preview**\n\`\`\`text\n${formatBotOpsJobDetails(job)}\n\`\`\`\nThis preview is read-only and starts no worker execution.`
        : `BotOps job \`${jobId}\` was not found.`,
    });
    return;
  }

  if (action === "approve") {
    const currentJob = getBotOpsJob(jobId);
    const job = currentJob?.approval_state === "required"
      ? approveBotOpsJob(jobId, interaction.user.id)
      : undefined;
    await interaction.editReply({
      content: buildBotOpsApproveReply(jobId, currentJob, job),
    });
    return;
  }

  if (action === "cancel") {
    const cancelled = updateBotOpsJobStatus(jobId, "Cancelled", "cancelled by operator");
    await interaction.editReply({
      content: cancelled
        ? `BotOps job \`${jobId}\` cancelled.`
        : `BotOps job \`${jobId}\` was not found.`,
    });
    return;
  }

  if (action === "recover") {
    const recovery = recoverBotOpsWaitingWorkerJob(jobId, interaction.user.id);
    if (recovery.recovered) {
      await interaction.editReply({
        content: `**BotOps recovery requested**\n\`\`\`text\n${formatBotOpsJobDetails(recovery.job)}\n\`\`\`\nNo execution was started by this recovery command.`,
      });
      return;
    }

    await interaction.editReply({
      content: recovery.job
        ? `BotOps job \`${jobId}\` was not recovered: ${recovery.reason}.\n\`\`\`text\n${formatBotOpsJobDetails(recovery.job)}\n\`\`\``
        : `BotOps job \`${jobId}\` was not found.`,
    });
    return;
  }

  if (action === "logs") {
    const job = getBotOpsJob(jobId);
    const events = job ? listBotOpsJobEvents(jobId, 12) : [];
    await interaction.editReply({
      content: job
        ? `**BotOps job**\n\`\`\`text\n${formatBotOpsJobDetails(job)}\n\n${formatBotOpsEventDetails(events)}\n\`\`\``
        : `BotOps job \`${jobId}\` was not found.`,
    });
  }
}
