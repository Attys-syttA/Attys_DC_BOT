import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  TextChannel,
  type Attachment,
} from "discord.js";
import { getProject } from "../../db/database.js";
import { checkRateLimit } from "../../security/guard.js";
import { sessionManager } from "../../codex/session-manager.js";
import { L } from "../../utils/i18n.js";
import { buildAttachmentPromptSuffix, downloadAttachment } from "../attachments.js";

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
