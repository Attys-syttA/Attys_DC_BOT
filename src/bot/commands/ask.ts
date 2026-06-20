import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  TextChannel,
  type Attachment,
} from "discord.js";
import { getProject } from "../../db/database.js";
import { checkRateLimit } from "../../security/guard.js";
import { sessionManager } from "../../codex/session-manager.js";
import { L } from "../../utils/i18n.js";
import { buildAttachmentPromptSuffix, downloadAttachment } from "../attachments.js";
import { getConfig } from "../../utils/config.js";

export const data = new SlashCommandBuilder()
  .setName("ask")
  .setDescription("Send a prompt to the Codex session registered to this channel")
  .addStringOption((opt) =>
    opt
      .setName("prompt")
      .setDescription("Prompt for local Codex")
      .setRequired(true),
  )
  .addAttachmentOption((opt) =>
    opt
      .setName("file")
      .setDescription("Optional image or file for Codex to inspect")
      .setRequired(false),
  );

function formatPromptForDiscord(prompt: string): string {
  const normalized = prompt.replace(/```/g, "'''");
  return normalized.length > 1_400 ? `${normalized.slice(0, 1_400)}...` : normalized;
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const project = getProject(interaction.channelId);
  if (!project) {
    await interaction.editReply({
      content: L("This channel is not registered to any project.", "이 채널은 어떤 프로젝트에도 등록되어 있지 않습니다."),
    });
    return;
  }

  if (!checkRateLimit(interaction.user.id)) {
    await interaction.editReply({
      content: L("Rate limit exceeded. Please wait a moment.", "요청 한도를 초과했습니다. 잠시 후 다시 시도하세요."),
    });
    return;
  }

  const prompt = interaction.options.getString("prompt", true).trim();
  if (!prompt) {
    await interaction.editReply({ content: L("Prompt is empty.", "프롬프트가 비어 있습니다.") });
    return;
  }

  if (!interaction.channel?.isTextBased() || interaction.channel.isDMBased()) {
    await interaction.editReply({ content: L("This command must be used in a server text channel.", "이 명령은 서버 텍스트 채널에서 사용해야 합니다.") });
    return;
  }

  const attachment = interaction.options.getAttachment("file", false);
  let finalPrompt = prompt;
  const attachmentNotes: string[] = [];
  if (attachment) {
    const result = await downloadAttachment(attachment as Attachment, project.project_path);
    if ("skipped" in result) {
      attachmentNotes.push(result.skipped);
    } else {
      finalPrompt += buildAttachmentPromptSuffix([result]);
      attachmentNotes.push(`Attachment saved for Codex: \`${result.safeName}\``);
    }
  }

  if (sessionManager.isActive(interaction.channelId)) {
    if (sessionManager.hasQueue(interaction.channelId)) {
      await interaction.editReply({
        content: L("⏳ A message is already waiting to be queued. Please press the button first.", "⏳ 이미 큐 추가 대기 중인 메시지가 있습니다. 버튼을 먼저 눌러주세요."),
      });
      return;
    }
    if (sessionManager.isQueueFull(interaction.channelId)) {
      await interaction.editReply({
        content: L(`⏳ Queue is full (max ${getConfig().DISCORD_QUEUE_MAX_ITEMS}). Please wait for the current task to finish.`, `⏳ 큐가 가득 찼습니다 (최대 ${getConfig().DISCORD_QUEUE_MAX_ITEMS}개). 현재 작업 완료를 기다려주세요.`),
      });
      return;
    }

    sessionManager.setPendingQueue(interaction.channelId, interaction.channel as TextChannel, finalPrompt);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`queue-yes:${interaction.channelId}`)
        .setLabel(L("Add to Queue", "큐에 추가"))
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
      new ButtonBuilder()
        .setCustomId(`queue-no:${interaction.channelId}`)
        .setLabel(L("Cancel", "취소"))
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❌"),
    );

    await interaction.editReply({
      content: [
        L("⏳ A previous task is in progress. Process this automatically when done?", "⏳ 이전 작업이 진행 중입니다. 완료 후 자동으로 처리할까요?"),
        ...attachmentNotes,
      ].join("\n"),
      components: [row],
    });
    return;
  }

  await interaction.editReply({
    content: [
      L("Prompt sent to local Codex.", "로컬 Codex로 프롬프트를 보냈습니다."),
      ...attachmentNotes,
      "```text",
      formatPromptForDiscord(prompt),
      "```",
    ].join("\n"),
  });
  await sessionManager.sendMessage(interaction.channel as TextChannel, finalPrompt);
}
