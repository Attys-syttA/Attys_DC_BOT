import { Message, TextChannel, Attachment, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getProject } from "../../db/database.js";
import { isAllowedPrincipal, checkRateLimit } from "../../security/guard.js";
import { sessionManager } from "../../codex/session-manager.js";
import { getConfig } from "../../utils/config.js";
import { L } from "../../utils/i18n.js";
import { buildAttachmentPromptSuffix, downloadAttachment, safeAttachmentFileName } from "../attachments.js";

function messageRoleIds(message: Message): string[] {
  return message.member ? [...message.member.roles.cache.keys()] : [];
}

export { safeAttachmentFileName };

export async function handleMessage(message: Message): Promise<void> {
  if (message.author.bot || !message.guild) return;

  const project = getProject(message.channelId);
  if (!project) return;

  const config = getConfig();
  const text = message.content.trim();
  const hasAttachments = message.attachments.size > 0;
  const hasPendingCustomInput = sessionManager.hasPendingCustomInput(message.channelId);
  const shouldHandlePrompt =
    (config.DISCORD_ENABLE_MESSAGE_PROMPTS && Boolean(text)) ||
    (hasAttachments && (config.DISCORD_ENABLE_MESSAGE_PROMPTS || config.DISCORD_ENABLE_ATTACHMENT_MESSAGES));

  if (!hasPendingCustomInput && !shouldHandlePrompt) return;

  if (!isAllowedPrincipal(message.author.id, messageRoleIds(message))) {
    await message.reply(L("You are not authorized to use this bot.", "이 봇을 사용할 권한이 없습니다."));
    return;
  }

  if (!checkRateLimit(message.author.id)) {
    await message.reply(L("Rate limit exceeded. Please wait a moment.", "요청 한도를 초과했습니다. 잠시 후 다시 시도하세요."));
    return;
  }

  if (hasPendingCustomInput) {
    if (text) {
      sessionManager.resolveCustomInput(message.channelId, text);
      await message.react("✅");
    }
    return;
  }

  if (hasAttachments && !text) {
    await message.reply(L(
      "I can see an attachment, but I need an instruction too. Use `Apps` -> `Send to Codex` on this message, or send `/ask prompt:` with file fields.",
      "첨부 파일은 보이지만 지시문도 필요합니다. 이 메시지에서 `Apps` -> `Send to Codex`를 사용하거나 파일 필드와 함께 `/ask prompt:`를 보내세요.",
    ));
    return;
  }

  let prompt = text;
  const downloadedAttachments: Array<{ filePath: string; isImage: boolean; safeName: string }> = [];
  const skippedMessages: string[] = [];

  for (const [, attachment] of message.attachments) {
    const result = await downloadAttachment(attachment as Attachment, project.project_path);
    if ("skipped" in result) {
      skippedMessages.push(result.skipped);
      continue;
    }
    downloadedAttachments.push(result);
  }

  if (skippedMessages.length > 0) {
    await message.reply(skippedMessages.join("\n"));
  }

  prompt += buildAttachmentPromptSuffix(downloadedAttachments);

  if (!prompt) return;

  const channel = message.channel as TextChannel;

  if (sessionManager.isActive(message.channelId)) {
    if (sessionManager.hasQueue(message.channelId)) {
      await message.reply(L("⏳ A message is already waiting to be queued. Please press the button first.", "⏳ 이미 큐 추가 대기 중인 메시지가 있습니다. 버튼을 먼저 눌러주세요."));
      return;
    }
    if (sessionManager.isQueueFull(message.channelId)) {
      const maxQueueItems = getConfig().DISCORD_QUEUE_MAX_ITEMS;
      await message.reply(L(`⏳ Queue is full (max ${maxQueueItems}). Please wait for the current task to finish.`, `⏳ 큐가 가득 찼습니다 (최대 ${maxQueueItems}개). 현재 작업 완료를 기다려주세요.`));
      return;
    }

    sessionManager.setPendingQueue(message.channelId, channel, prompt);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`queue-yes:${message.channelId}`)
        .setLabel(L("Add to Queue", "큐에 추가"))
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
      new ButtonBuilder()
        .setCustomId(`queue-no:${message.channelId}`)
        .setLabel(L("Cancel", "취소"))
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❌"),
    );

    await message.reply({
      content: L("⏳ A previous task is in progress. Process this automatically when done?", "⏳ 이전 작업이 진행 중입니다. 완료 후 자동으로 처리할까요?"),
      components: [row],
    });
    return;
  }

  await sessionManager.sendMessage(channel, prompt);
}
