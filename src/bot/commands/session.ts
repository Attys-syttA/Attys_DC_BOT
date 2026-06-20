import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { getProject, getSession, upsertSession } from "../../db/database.js";
import { sessionManager } from "../../codex/session-manager.js";
import { L } from "../../utils/i18n.js";
import { sanitizePublicFileLabel } from "../../utils/public-safety.js";

export const data = new SlashCommandBuilder()
  .setName("session")
  .setDescription("Inspect or control the Codex session for this channel")
  .addSubcommand((sub) =>
    sub.setName("current").setDescription("Show the currently selected Codex session")
  )
  .addSubcommand((sub) =>
    sub.setName("new").setDescription("Start a fresh Codex session on the next prompt")
  )
  .addSubcommand((sub) =>
    sub.setName("stop").setDescription("Stop the active Codex turn in this channel")
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const channelId = interaction.channelId;
  const project = getProject(channelId);

  if (!project) {
    await interaction.editReply({
      content: L("This channel is not registered to any project. Use `/register` first.", "이 채널은 어떤 프로젝트에도 등록되어 있지 않습니다. 먼저 `/register`를 사용하세요."),
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "current") {
    const session = getSession(channelId);
    await interaction.editReply({
      embeds: [
        {
          title: L("Current Session", "현재 세션"),
          description: [
            `${L("Project", "프로젝트")}: \`${sanitizePublicFileLabel(project.project_path)}\``,
            `${L("Thread", "스레드")}: ${session?.session_id ? `\`${session.session_id}\`` : L("new session on next prompt", "다음 프롬프트에서 새 세션")}`,
            `${L("Status", "상태")}: **${session?.status ?? "offline"}**`,
            `${L("Active turn", "활성 작업")}: **${sessionManager.isActive(channelId) ? "yes" : "no"}**`,
            `${L("Last activity", "마지막 활동")}: ${session?.last_activity ?? "never"}`,
          ].join("\n"),
          color: 0x5865f2,
        },
      ],
    });
    return;
  }

  if (subcommand === "new") {
    upsertSession(randomUUID(), channelId, null, "idle");
    await interaction.editReply({
      embeds: [
        {
          title: L("New Session Ready", "새 세션 준비됨"),
          description: L(
            "The next prompt in this channel will start a fresh local Codex thread.",
            "이 채널의 다음 프롬프트는 새로운 로컬 Codex 스레드를 시작합니다.",
          ),
          color: 0x10b981,
        },
      ],
    });
    return;
  }

  const stopped = await sessionManager.stopSession(channelId);
  await interaction.editReply({
    content: stopped
      ? L("Stopped the active Codex turn.", "활성 Codex 작업을 중지했습니다.")
      : L("No active Codex turn is running in this channel.", "이 채널에서 실행 중인 Codex 작업이 없습니다."),
  });
}
