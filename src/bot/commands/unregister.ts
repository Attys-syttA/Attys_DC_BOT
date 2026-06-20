import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { unregisterProject, getProject } from "../../db/database.js";
import { sessionManager } from "../../codex/session-manager.js";
import { L } from "../../utils/i18n.js";
import { sanitizePublicFileLabel } from "../../utils/public-safety.js";

export const data = new SlashCommandBuilder()
  .setName("unregister")
  .setDescription("Unregister a channel from its project")
  .addChannelOption((option) =>
    option
      .setName("channel")
      .setDescription("Optional registered channel to unregister; defaults to the current channel")
      .setRequired(false),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const selectedChannel = interaction.options.getChannel("channel", false);
  const channelId = selectedChannel?.id ?? interaction.channelId;
  const project = getProject(channelId);

  if (!project) {
    await interaction.editReply({
      content: selectedChannel
        ? L("The selected channel is not registered to any project.", "선택한 채널은 어떤 프로젝트에도 등록되어 있지 않습니다.")
        : L("This channel is not registered to any project.", "이 채널은 어떤 프로젝트에도 등록되어 있지 않습니다."),
    });
    return;
  }

  await sessionManager.stopSession(channelId);
  unregisterProject(channelId);

  await interaction.editReply({
    embeds: [
        {
          title: L("Project Unregistered", "프로젝트 등록 해제됨"),
          description: L(`Removed <#${channelId}> link to \`${sanitizePublicFileLabel(project.project_path)}\``, `<#${channelId}>의 \`${sanitizePublicFileLabel(project.project_path)}\` 연결이 해제되었습니다`),
          color: 0xff0000,
      },
    ],
  });
}
