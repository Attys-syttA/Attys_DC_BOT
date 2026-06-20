import {
  ActionRowBuilder,
  ApplicationCommandType,
  ButtonBuilder,
  ButtonStyle,
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
  ModalBuilder,
  ModalSubmitInteraction,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
  type Attachment,
} from "discord.js";
import { getProject } from "../../db/database.js";
import { checkRateLimit } from "../../security/guard.js";
import { sessionManager } from "../../codex/session-manager.js";
import { buildAttachmentPromptSuffix, downloadAttachment, type AttachmentLike, type DownloadedAttachment } from "../attachments.js";
import { getConfig } from "../../utils/config.js";
import { L } from "../../utils/i18n.js";
import { sanitizePublicText } from "../../utils/public-safety.js";

const MODAL_PREFIX = "send-to-codex-prompt:";
const PROMPT_INPUT_ID = "prompt";
const pendingUploads = new Map<string, {
  attachments: AttachmentLike[];
  channelId: string;
  createdAt: number;
  userId: string;
}>();

export const data = new ContextMenuCommandBuilder()
  .setName("Send to Codex")
  .setType(ApplicationCommandType.Message);

function extractMessagePrompt(content: string): string {
  const trimmed = content.trim();
  return trimmed.replace(/^file\s*:\s*/i, "").trim();
}

function formatPromptForDiscord(prompt: string): string {
  const normalized = sanitizePublicText(prompt, 900).replace(/```/g, "'''");
  return normalized.length > 900 ? `${normalized.slice(0, 900)}...` : normalized;
}

export async function execute(
  interaction: MessageContextMenuCommandInteraction,
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

  if (!interaction.channel?.isTextBased() || interaction.channel.isDMBased()) {
    await interaction.editReply({ content: L("This command must be used in a server text channel.", "이 명령은 서버 텍스트 채널에서 사용해야 합니다.") });
    return;
  }

  const attachments = [...interaction.targetMessage.attachments.values()];
  const prompt = extractMessagePrompt(interaction.targetMessage.content ?? "");
  if (attachments.length === 0 && !prompt) {
    await interaction.reply({
      content: "The selected message has no usable text or attachment for Codex.",
      flags: ["Ephemeral"],
    });
    return;
  }

  if (attachments.length > 0 && !prompt) {
    await showPromptModal(interaction, attachments);
    return;
  }

  await interaction.deferReply();
  await sendToCodex(interaction, prompt, attachments, project.project_path);
}

async function showPromptModal(
  interaction: MessageContextMenuCommandInteraction,
  attachments: Attachment[],
): Promise<void> {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  pendingUploads.set(requestId, {
    attachments: attachments.map((attachment) => ({
      name: attachment.name,
      size: attachment.size,
      url: attachment.url,
    })),
    channelId: interaction.channelId,
    createdAt: Date.now(),
    userId: interaction.user.id,
  });

  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_PREFIX}${requestId}`)
    .setTitle("Send file to Codex");
  const promptInput = new TextInputBuilder()
    .setCustomId(PROMPT_INPUT_ID)
    .setLabel("Mit csinaljon Codex a fajllal?")
    .setPlaceholder("Peldaul: nezd at, hogy a terv minden pontja teljesult-e")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1_500);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(promptInput));
  await interaction.showModal(modal);
}

export async function handleModalSubmit(
  interaction: ModalSubmitInteraction,
): Promise<boolean> {
  if (!interaction.customId.startsWith(MODAL_PREFIX)) return false;

  const requestId = interaction.customId.slice(MODAL_PREFIX.length);
  const pending = pendingUploads.get(requestId);
  pendingUploads.delete(requestId);

  if (!pending || pending.userId !== interaction.user.id || pending.channelId !== interaction.channelId) {
    await interaction.reply({
      content: "This file handoff expired. Use `Send to Codex` on the attachment again.",
      flags: ["Ephemeral"],
    });
    return true;
  }

  if (Date.now() - pending.createdAt > 10 * 60 * 1000) {
    await interaction.reply({
      content: "This file handoff expired. Use `Send to Codex` on the attachment again.",
      flags: ["Ephemeral"],
    });
    return true;
  }

  const project = getProject(interaction.channelId);
  if (!project) {
    await interaction.reply({
      content: L("This channel is not registered to any project.", "이 채널은 어떤 프로젝트에도 등록되어 있지 않습니다."),
      flags: ["Ephemeral"],
    });
    return true;
  }

  if (!checkRateLimit(interaction.user.id)) {
    await interaction.reply({
      content: L("Rate limit exceeded. Please wait a moment.", "요청 한도를 초과했습니다. 잠시 후 다시 시도하세요."),
      flags: ["Ephemeral"],
    });
    return true;
  }

  const prompt = interaction.fields.getTextInputValue(PROMPT_INPUT_ID).trim();
  if (!prompt) {
    await interaction.reply({ content: L("Prompt is empty.", "프롬프트가 비어 있습니다."), flags: ["Ephemeral"] });
    return true;
  }

  await interaction.deferReply();
  await sendToCodex(interaction, prompt, pending.attachments, project.project_path);
  return true;
}

async function sendToCodex(
  interaction: MessageContextMenuCommandInteraction | ModalSubmitInteraction,
  prompt: string,
  attachments: AttachmentLike[],
  projectPath: string,
): Promise<void> {
  const attachmentNotes: string[] = [];
  const downloadedAttachments: DownloadedAttachment[] = [];
  for (const attachment of attachments) {
    const result = await downloadAttachment(attachment, projectPath);
    if ("skipped" in result) {
      attachmentNotes.push(result.skipped);
    } else {
      downloadedAttachments.push(result);
      attachmentNotes.push(`Attachment saved for Codex: \`${result.safeName}\``);
    }
  }

  const finalPrompt = prompt + buildAttachmentPromptSuffix(downloadedAttachments);
  const channelId = interaction.channelId;
  if (!channelId || !interaction.channel?.isTextBased() || interaction.channel.isDMBased()) {
    await interaction.editReply({ content: L("This command must be used in a server text channel.", "이 명령은 서버 텍스트 채널에서 사용해야 합니다.") });
    return;
  }
  const channel = interaction.channel as TextChannel;

  if (sessionManager.isActive(channelId)) {
    if (sessionManager.hasQueue(channelId)) {
      await interaction.editReply({
        content: L("⏳ A message is already waiting to be queued. Please press the button first.", "⏳ 이미 큐 추가 대기 중인 메시지가 있습니다. 버튼을 먼저 눌러주세요."),
      });
      return;
    }
    if (sessionManager.isQueueFull(channelId)) {
      await interaction.editReply({
        content: L(`⏳ Queue is full (max ${getConfig().DISCORD_QUEUE_MAX_ITEMS}). Please wait for the current task to finish.`, `⏳ 큐가 가득 찼습니다 (최대 ${getConfig().DISCORD_QUEUE_MAX_ITEMS}개). 현재 작업 완료를 기다려주세요.`),
      });
      return;
    }

    sessionManager.setPendingQueue(channelId, channel, finalPrompt);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`queue-yes:${channelId}`)
        .setLabel(L("Add to Queue", "큐에 추가"))
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
      new ButtonBuilder()
        .setCustomId(`queue-no:${channelId}`)
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
      "Message sent to local Codex.",
      ...attachmentNotes,
      "```text",
      formatPromptForDiscord(prompt),
      "```",
    ].join("\n"),
  });
  await sessionManager.sendMessage(channel, finalPrompt);
}
