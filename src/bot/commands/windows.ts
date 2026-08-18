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
        { name: "push", value: "push" },
        { name: "restart", value: "restart" },
      ))
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
    "helpers: status, check, push, restart",
    "approval required: push, restart",
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
      content: "`/windows helper-run` rejected an unsupported helper. Allowed helpers: `status`, `check`, `push`, `restart`.",
    });
    return;
  }

  const { job, created } = createOrGetBotOpsJob({
    job_id: interaction.options.getString("job_id") ?? undefined,
    requested_by: interaction.user.id,
    target: "windows",
    capability,
    summary: `Windows fixed helper request: ${helper}`,
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
