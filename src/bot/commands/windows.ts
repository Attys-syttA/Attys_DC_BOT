import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { createOrGetBotOpsJob, listBotOpsWorkerHeartbeats } from "../../db/database.js";
import { formatBotOpsJobDetails, formatBotOpsWorkerHeartbeats } from "../../botops/render.js";
import type { BotOpsCapability } from "../../botops/contract.js";

const helperCapabilities: Record<string, BotOpsCapability> = {
  status: "status.read",
  check: "audit.check",
  commit: "git.commit",
  push: "git.push",
  restart: "service.restart",
};

export function resolveWindowsHelperCapability(helper: string): BotOpsCapability | undefined {
  return helperCapabilities[helper];
}

export const data = new SlashCommandBuilder()
  .setName("windows")
  .setDescription("Create staged Windows execution-plane requests")
  .addSubcommand((subcommand) => subcommand
    .setName("status")
    .setDescription("Show Windows execution-plane control status"))
  .addSubcommand((subcommand) => subcommand
    .setName("helper-run")
    .setDescription("Queue a fixed Windows helper request without running arbitrary shell")
    .addStringOption((option) => option
      .setName("helper")
      .setDescription("Fixed helper")
      .setRequired(true)
      .addChoices(
        { name: "status", value: "status" },
        { name: "check", value: "check" },
        { name: "commit", value: "commit" },
        { name: "push", value: "push" },
        { name: "restart", value: "restart" },
      ))
    .addStringOption((option) => option
      .setName("message")
      .setDescription("Commit message for the commit helper")
      .setMaxLength(180))
    .addStringOption((option) => option
      .setName("job_id")
      .setDescription("Optional idempotency key")));

export function buildWindowsStatusReply(): string {
  const heartbeats = listBotOpsWorkerHeartbeats("windows");
  return [
    "**Windows execution plane**",
    "```text",
    "mode: limited fixed helpers",
    "arbitrary shell: disabled",
    "helpers: status, check, commit, push, restart",
    "approval required: commit, push, restart",
    "",
    formatBotOpsWorkerHeartbeats(heartbeats),
    "```",
  ].join("\n");
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const action = interaction.options.getSubcommand();
  if (action === "status") {
    await interaction.editReply({ content: buildWindowsStatusReply() });
    return;
  }

  const helper = interaction.options.getString("helper", true);
  const capability = resolveWindowsHelperCapability(helper);
  if (!capability) {
    await interaction.editReply({
      content: "`/windows helper-run` rejected an unsupported helper. Allowed helpers: `status`, `check`, `commit`, `push`, `restart`.",
    });
    return;
  }

  const message = interaction.options.getString("message")?.trim();
  if (helper === "commit" && !message) {
    await interaction.editReply({
      content: "`/windows helper-run helper:commit` requires `message:<commit message>`.",
    });
    return;
  }

  const { job, created } = createOrGetBotOpsJob({
    job_id: interaction.options.getString("job_id") ?? undefined,
    requested_by: interaction.user.id,
    target: "windows",
    capability,
    summary: helper === "commit"
      ? "Windows fixed helper request: commit staged changes"
      : `Windows fixed helper request: ${helper}`,
    payload_json: helper === "commit" ? JSON.stringify({ message }) : undefined,
  });

  await interaction.editReply({
    content: [
      created ? "**Windows helper request queued**" : "**Windows helper request already exists**",
      "```text",
      formatBotOpsJobDetails(job),
      "```",
      "No helper was executed directly from Discord.",
    ].join("\n"),
  });
}
