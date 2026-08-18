import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import {
  approveBotOpsJob,
  getBotOpsJob,
  listBotOpsJobEvents,
  listBotOpsJobs,
  updateBotOpsJobStatus,
} from "../../db/database.js";
import {
  buildBotOpsJobsReply,
  buildBotOpsStatusReply,
  formatBotOpsEventDetails,
  formatBotOpsJobDetails,
} from "../../botops/render.js";

export const data = new SlashCommandBuilder()
  .setName("ops")
  .setDescription("Inspect and approve staged BotOps jobs")
  .addSubcommand((subcommand) => subcommand
    .setName("status")
    .setDescription("Show staged BotOps control-plane status"))
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
    await interaction.editReply({ content: buildBotOpsStatusReply(listBotOpsJobs(25)) });
    return;
  }

  if (action === "jobs") {
    const limit = interaction.options.getInteger("limit") ?? 10;
    await interaction.editReply({ content: buildBotOpsJobsReply(listBotOpsJobs(limit)) });
    return;
  }

  const jobId = interaction.options.getString("job_id", true);
  if (action === "approve") {
    const job = approveBotOpsJob(jobId, interaction.user.id);
    await interaction.editReply({
      content: job
        ? `**BotOps approval recorded**\n\`\`\`text\n${formatBotOpsJobDetails(job)}\n\`\`\`\nNo execution was started by this approval command.`
        : `BotOps job \`${jobId}\` was not found.`,
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
