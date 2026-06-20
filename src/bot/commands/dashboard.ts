import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { getProject, getSession } from "../../db/database.js";
import { sessionManager } from "../../codex/session-manager.js";
import { resolveCodexCommand } from "../../codex/command-resolver.js";
import { L } from "../../utils/i18n.js";
import { sanitizePublicFileLabel } from "../../utils/public-safety.js";
import { readOperatorStartupLog } from "./tools.js";

export const data = new SlashCommandBuilder()
  .setName("dashboard")
  .setDescription("Show the local Codex control center for this Discord channel");

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const channelId = interaction.channelId;
  const project = getProject(channelId);

  if (!project) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(L("Local Codex Dashboard", "로컬 Codex 대시보드"))
          .setDescription(L("This channel is not registered to a project yet. Use `/register` first.", "이 채널은 아직 프로젝트에 등록되어 있지 않습니다. 먼저 `/register`를 사용하세요."))
          .setColor(0xf59e0b),
      ],
    });
    return;
  }

  const session = getSession(channelId);
  const dbStatus = session?.status ?? "offline";
  const runtimeStatus = sessionManager.isActive(channelId)
    ? L("active turn", "활성 작업")
    : L("idle or stopped", "대기 또는 중지");
  const queueSize = sessionManager.getQueueSize(channelId);
  const runtime = sessionManager.getOperatorRuntimeSnapshot(channelId);
  const codexCommand = resolveCodexCommand();
  const operatorToolsLog = readOperatorStartupLog(process.cwd(), 1);
  const operatorToolsStatus = operatorToolsLog.length > 0
    ? operatorToolsLog[0].replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\s+/, "")
    : "no local tools preflight yet";

  const embed = new EmbedBuilder()
    .setTitle(L("Local Codex Dashboard", "로컬 Codex 대시보드"))
    .setColor(0x5865f2)
    .setTimestamp()
    .addFields(
      {
        name: L("Project", "프로젝트"),
        value: `\`${sanitizePublicFileLabel(project.project_path)}\``,
        inline: false,
      },
      {
        name: L("Session", "세션"),
        value: [
          `${L("Stored status", "저장된 상태")}: **${dbStatus}**`,
          `${L("Runtime", "런타임")}: **${runtimeStatus}**`,
          `${L("Thread", "스레드")}: ${session?.session_id ? `\`${session.session_id.slice(0, 8)}...\`` : L("new session on next prompt", "다음 프롬프트에서 새 세션")}`,
          `${L("Last activity", "마지막 활동")}: ${session?.last_activity ?? "never"}`,
        ].join("\n"),
        inline: false,
      },
      {
        name: L("Controls", "컨트롤"),
        value: [
          `${L("Queue", "큐")}: **${queueSize}**`,
          `${L("Pending operator action", "대기 중인 operator 작업")}: **${describePendingOperatorAction(runtime)}**`,
          `${L("Auto-approve", "자동 승인")}: **${project.auto_approve ? "on" : "off"}**`,
          `${L("Codex command", "Codex 명령")}: \`${codexCommand}\``,
          `${L("Operator tools", "Operator tools")}: **${operatorToolsStatus}**`,
        ].join("\n"),
        inline: false,
      },
    );

  const buttons: ButtonBuilder[] = [];
  if (sessionManager.isActive(channelId)) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`stop:${channelId}`)
        .setLabel(L("Stop", "중지"))
        .setStyle(ButtonStyle.Danger),
    );
  }
  if (queueSize > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`queue-clear:${channelId}`)
        .setLabel(L("Clear Queue", "큐 비우기"))
        .setStyle(ButtonStyle.Secondary),
    );
  }

  await interaction.editReply({
    embeds: [embed],
    components: buttons.length > 0
      ? [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)]
      : [],
  });
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
