import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";
import { getAllProjects, getSession } from "../../db/database.js";
import { sessionManager } from "../../codex/session-manager.js";
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
      content: L("No projects registered. Use `/register` in a channel first.", "등록된 프로젝트가 없습니다. 먼저 채널에서 `/register`를 사용하세요."),
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(L("Codex Sessions", "Codex 세션"))
    .setColor(0x10b981)
    .setTimestamp();

  for (const project of projects) {
    const session = getSession(project.channel_id);
    const status = session?.status ?? "offline";
    const emoji = STATUS_EMOJI[status] ?? "🔴";
    const lastActivity = session?.last_activity ?? "never";
    const runtime = sessionManager.getOperatorRuntimeSnapshot(project.channel_id);
    const queueSize = sessionManager.getQueueSize(project.channel_id);

    embed.addFields({
      name: `${emoji} <#${project.channel_id}>`,
      value: [
        `\`${sanitizePublicFileLabel(project.project_path)}\``,
        `${L("Status", "상태")}: **${status}**`,
        `${L("Runtime", "런타임")}: **${sessionManager.isActive(project.channel_id) ? "active" : "idle"}**`,
        `${L("Queue", "큐")}: **${queueSize}**`,
        `${L("Pending", "대기 중")}: **${describePendingOperatorAction(runtime)}**`,
        `${L("Auto-approve", "자동 승인")}: ${project.auto_approve ? L("On", "켜짐") : L("Off", "꺼짐")}`,
        `${L("Last activity", "마지막 활동")}: ${lastActivity}`,
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
