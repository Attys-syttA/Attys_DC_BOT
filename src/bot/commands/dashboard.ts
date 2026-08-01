import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { getLatestAuditJob, getProject, getSession, listAuditSteps } from "../../db/database.js";
import type { AuditJobRecord, AuditStepRecord } from "../../db/types.js";
import { sessionManager } from "../../codex/session-manager.js";
import { resolveCodexCommand } from "../../codex/command-resolver.js";
import { L } from "../../utils/i18n.js";
import { sanitizePublicFileLabel } from "../../utils/public-safety.js";
import { readOperatorStartupLog } from "./tools.js";
import { describeOperatorEventLine, readOperatorEvents } from "../operator-events.js";

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
          .setTitle(L("Local Codex Dashboard", "Helyi Codex Dashboard"))
          .setDescription(L("This channel is not registered to a project yet. Use `/register` first.", "Ez a csatorna még nincs projekthez regisztrálva. Előbb használd a `/register` parancsot."))
          .setColor(0xf59e0b),
      ],
    });
    return;
  }

  const session = getSession(channelId);
  const dbStatus = session?.status ?? "offline";
  const runtimeStatus = sessionManager.isActive(channelId)
    ? L("active turn", "Aktív feladat")
    : L("idle or stopped", "várakozik vagy leállítva");
  const queueSize = sessionManager.getQueueSize(channelId);
  const runtime = sessionManager.getOperatorRuntimeSnapshot(channelId);
  const codexCommand = resolveCodexCommand();
  const operatorToolsLog = readOperatorStartupLog(process.cwd(), 1);
  const operatorToolsStatus = operatorToolsLog.length > 0
    ? operatorToolsLog[0].replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\s+/, "")
    : "no local tools preflight yet";
  const recentEvents = readOperatorEvents(process.cwd(), 3)
    .map(describeOperatorEventLine)
    .reverse();
  const latestAuditJob = getLatestAuditJob(channelId);
  const latestAuditSteps = latestAuditJob ? listAuditSteps(latestAuditJob.id) : [];

  const embed = new EmbedBuilder()
    .setTitle(L("Local Codex Dashboard", "Helyi Codex Dashboard"))
    .setColor(0x5865f2)
    .setTimestamp()
    .addFields(
      {
        name: L("Project", "Projekt"),
        value: `\`${sanitizePublicFileLabel(project.project_path)}\``,
        inline: false,
      },
      {
        name: L("Session", "Session"),
        value: [
          `${L("Stored status", "Mentett állapot")}: **${dbStatus}**`,
          `${L("Runtime", "Runtime")}: **${runtimeStatus}**`,
          `${L("Thread", "Thread")}: ${session?.session_id ? `\`${session.session_id.slice(0, 8)}...\`` : L("new session on next prompt", "új session a következő promptnál")}`,
          `${L("Last activity", "Utolsó aktivitás")}: ${session?.last_activity ?? "never"}`,
        ].join("\n"),
        inline: false,
      },
      {
        name: L("Controls", "Vezérlés"),
        value: [
          `${L("Queue", "Queue")}: **${queueSize}**`,
          `${L("Pending operator action", "Függő operátori művelet")}: **${describePendingOperatorAction(runtime)}**`,
          `${L("Auto-approve", "Auto-jóváhagyás")}: **${project.auto_approve ? "on" : "off"}**`,
          `${L("Codex command", "Codex parancs")}: \`${codexCommand}\``,
          `${L("Operator tools", "Operator tools")}: **${operatorToolsStatus}**`,
        ].join("\n"),
        inline: false,
      },
      {
        name: L("Recent operator events", "Legutóbbi operátori események"),
        value: recentEvents.length > 0
          ? recentEvents.map((line) => `- ${line}`).join("\n")
          : "none",
        inline: false,
      },
      {
        name: "Audit",
        value: describeAuditJob(latestAuditJob, latestAuditSteps),
        inline: false,
      },
    );

  const buttons: ButtonBuilder[] = [];
  if (sessionManager.isActive(channelId)) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`stop:${channelId}`)
        .setLabel(L("Stop", "Leállítás"))
        .setStyle(ButtonStyle.Danger),
    );
  }
  if (queueSize > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`queue-clear:${channelId}`)
        .setLabel(L("Clear Queue", "Queue ürítése"))
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

function describeAuditJob(job: AuditJobRecord | undefined, steps: AuditStepRecord[]): string {
  if (!job) return "none";
  const latestStep = steps.at(-1);
  return [
    `Job: \`${job.id.slice(0, 8)}...\``,
    `Status: **${job.status}**`,
    `Current step: **${job.current_step ?? "none"}**`,
    latestStep ? `Latest step: **${latestStep.step_name} ${latestStep.status}**` : "Latest step: none",
  ].join("\n");
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
