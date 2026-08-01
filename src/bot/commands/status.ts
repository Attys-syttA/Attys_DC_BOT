import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";
import { getAllProjects, getLatestAuditJob, getSession, listAuditSteps } from "../../db/database.js";
import { sessionManager } from "../../codex/session-manager.js";
import { describeAuditInline } from "../audit-summary.js";
import { L } from "../../utils/i18n.js";
import { sanitizePublicFileLabel } from "../../utils/public-safety.js";

const STATUS_EMOJI: Record<string, string> = {
  online: "🟢",
  waiting: "🟡",
  idle: "⚪",
  offline: "🔴",
};

export const data = new SlashCommandBuilder()
  .setName("status")
  .setDescription("Show status of all registered project sessions");

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guildId = interaction.guildId!;
  const projects = getAllProjects(guildId);

  if (projects.length === 0) {
    await interaction.editReply({
      content: L("No projects registered. Use `/register` in a channel first.", "Nincs regisztrált projekt. Előbb használd a `/register` parancsot egy csatornában."),
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(L("Codex Sessions", "Codex Session"))
    .setColor(0x10b981)
    .setTimestamp();

  for (const project of projects) {
    const session = getSession(project.channel_id);
    const status = session?.status ?? "offline";
    const emoji = STATUS_EMOJI[status] ?? "🔴";
    const lastActivity = session?.last_activity ?? "never";
    const runtime = sessionManager.getOperatorRuntimeSnapshot(project.channel_id);
    const queueSize = sessionManager.getQueueSize(project.channel_id);
    const latestAuditJob = getLatestAuditJob(project.channel_id);
    const latestAuditSteps = latestAuditJob ? listAuditSteps(latestAuditJob.id) : [];

    embed.addFields({
      name: `${emoji} <#${project.channel_id}>`,
      value: [
        `\`${sanitizePublicFileLabel(project.project_path)}\``,
        `${L("Status", "Állapot")}: **${status}**`,
        `${L("Runtime", "Runtime")}: **${sessionManager.isActive(project.channel_id) ? "active" : "idle"}**`,
        `${L("Queue", "Queue")}: **${queueSize}**`,
        `${L("Pending", "Függőben")}: **${describePendingOperatorAction(runtime)}**`,
        `${L("Audit", "Audit")}: **${describeAuditInline(latestAuditJob, latestAuditSteps)}**`,
        `${L("Auto-approve", "Auto-jóváhagyás")}: ${project.auto_approve ? L("On", "Be") : L("Off", "Ki")}`,
        `${L("Last activity", "Utolsó aktivitás")}: ${lastActivity}`,
      ].join("\n"),
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

function describePendingOperatorAction(runtime: {
  pendingApproval: boolean;
  pendingQuestion: boolean;
  pendingCustomInput: boolean;
  pendingQueuePrompt: boolean;
}): string {
  if (runtime.pendingCustomInput) return "custom answer";
  if (runtime.pendingQuestion) return "question";
  if (runtime.pendingApproval) return "approval";
  if (runtime.pendingQueuePrompt) return "queue confirmation";
  return "none";
}
