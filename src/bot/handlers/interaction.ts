import {
  ButtonInteraction,
  StringSelectMenuInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { isAllowedPrincipal } from "../../security/guard.js";
import { sessionManager } from "../../codex/session-manager.js";
import { prepareRepairWorktree } from "../../audit/worktree-manager.js";
import { upsertSession, getSession, getProject, getAllProjects, unregisterProject, getAuditJob, updateAuditJobProgress } from "../../db/database.js";
import { deleteStoredThread } from "../../codex/storage.js";
import { renderMappingsPayload } from "../commands/mappings.js";
import { readLastResponseWithFallback } from "../commands/last.js";
import { L } from "../../utils/i18n.js";
import { getConfig } from "../../utils/config.js";
import { sanitizePublicText } from "../../utils/public-safety.js";
import { recordOperatorEvent } from "../operator-events.js";

function interactionRoleIds(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
): string[] {
  const roles = interaction.member?.roles;
  if (!roles) return [];
  if (Array.isArray(roles)) return roles;
  if ("cache" in roles) return [...roles.cache.keys()];
  return [];
}

export async function handleButtonInteraction(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!isAllowedPrincipal(interaction.user.id, interactionRoleIds(interaction))) {
    await interaction.reply({
      content: L("You are not authorized.", "Nincs jogosultság."),
      ephemeral: true,
    });
    return;
  }

  const customId = interaction.customId;
  const colonIndex = customId.indexOf(":");
  const action = colonIndex === -1 ? customId : customId.slice(0, colonIndex);
  const requestId = colonIndex === -1 ? "" : customId.slice(colonIndex + 1);

  if (!requestId) {
    await interaction.reply({
      content: L("Invalid button interaction.", "Érvénytelen gomb interakció."),
      ephemeral: true,
    });
    return;
  }

  if (action === "stop") {
    const stopped = await sessionManager.stopSession(requestId);
    await interaction.update({
      content: L("⏹️ Task has been stopped.", "⏹️ A feladat le lett állítva."),
      components: [],
    });
    if (!stopped) {
      await interaction.followUp({
        content: L("No active session.", "Nincs aktív session."),
        ephemeral: true,
      });
    }
    return;
  }

  if (action === "queue-yes") {
    const confirmed = sessionManager.confirmQueue(requestId);
    if (!confirmed) {
      await interaction.update({
        content: L("⏳ Queue request has expired.", "⏳ A queue kérés lejárt."),
        components: [],
      });
      return;
    }
    const queueSize = sessionManager.getQueueSize(requestId);
    const maxQueueItems = getConfig().DISCORD_QUEUE_MAX_ITEMS;
    await interaction.update({
      content: L(`📨 Message added to queue (${queueSize}/${maxQueueItems}). It will be processed after the current task.`, `📨 Az üzenet bekerült a queue-ba (${queueSize}/${maxQueueItems}). Az aktuális feladat után automatikusan feldolgozom.`),
      components: [],
    });
    return;
  }

  if (action === "queue-no") {
    sessionManager.cancelQueue(requestId);
    await interaction.update({
      content: L("Cancelled.", "Mégse."),
      components: [],
    });
    return;
  }

  if (action === "session-resume") {
    const sessionId = requestId;
    const channelId = interaction.channelId;
    const { randomUUID } = await import("node:crypto");
    upsertSession(randomUUID(), channelId, sessionId, "idle");

    await interaction.update({
      embeds: [
        {
          title: L("Session Selected", "Session kiválasztva"),
          description: L(
            `Session: \`${sessionId.slice(0, 8)}...\`\n\nNext message you send will resume this Codex thread.`,
            `Session: \`${sessionId.slice(0, 8)}...\`\n\nA következő üzenettől ez a Codex thread folytatódik.`
          ),
          color: 0x00ff00,
        },
      ],
      components: [],
    });
    return;
  }

  if (action === "session-cancel") {
    await interaction.update({
      content: L("Cancelled.", "Mégse."),
      embeds: [],
      components: [],
    });
    return;
  }

  if (action === "ask-opt") {
    const lastColon = requestId.lastIndexOf(":");
    const actualRequestId = requestId.slice(0, lastColon);
    const selectedLabel = ("label" in interaction.component ? interaction.component.label : null) ?? "Unknown";

    const resolved = sessionManager.resolveQuestion(actualRequestId, selectedLabel);
    if (!resolved) {
      await interaction.reply({ content: L("This question has expired.", "Ez a kérdés lejárt."), ephemeral: true });
      return;
    }

    await interaction.update({
      content: L(`✅ Selected: **${selectedLabel}**`, `✅ Kiválasztva: **${selectedLabel}**`),
      embeds: [],
      components: [],
    });
    return;
  }

  if (action === "ask-other") {
    sessionManager.enableCustomInput(requestId, interaction.channelId);
    await interaction.update({
      content: L("✏️ Type your answer...", "✏️ Írd be a válaszod..."),
      embeds: [],
      components: [],
    });
    return;
  }

  if (action === "queue-clear") {
    const cleared = sessionManager.clearQueue(requestId);
    await interaction.update({
      embeds: [
        {
          title: L("Queue Cleared", "Queue törölve"),
          description: L(`Cleared ${cleared} queued message(s).`, `${cleared} függő üzenet törölve.`),
          color: 0xff6600,
        },
      ],
      components: [],
    });
    return;
  }

  if (action === "queue-remove") {
    const lastColon = requestId.lastIndexOf(":");
    const channelId = requestId.slice(0, lastColon);
    const index = parseInt(requestId.slice(lastColon + 1), 10);
    const removed = sessionManager.removeFromQueue(channelId, index);

    if (!removed) {
      await interaction.update({
        content: L("This item is no longer in the queue.", "Ez az elem már nincs a queue-ban."),
        embeds: [],
        components: [],
      });
      return;
    }

    const preview = sanitizePublicText(removed, 60) || "(empty prompt)";
    const queue = sessionManager.getQueue(channelId);
    if (queue.length === 0) {
      await interaction.update({
        embeds: [
          {
            title: L("Message Removed", "Üzenet törölve"),
            description: L(`Removed: ${preview}\n\nQueue is now empty.`, `Törölve: ${preview}\n\nA queue üres.`),
            color: 0xff6600,
          },
        ],
        components: [],
      });
      return;
    }

    const list = queue
      .map((item: { prompt: string }, idx: number) => {
        const p = sanitizePublicText(item.prompt, 100) || "(empty prompt)";
        return `**${idx + 1}.** ${p}`;
      })
      .join("\n\n");

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    const itemButtons = queue.map((_: unknown, idx: number) =>
      new ButtonBuilder()
        .setCustomId(`queue-remove:${channelId}:${idx}`)
        .setLabel(`❌ ${idx + 1}`)
        .setStyle(ButtonStyle.Secondary)
    );
    const clearButton = new ButtonBuilder()
      .setCustomId(`queue-clear:${channelId}`)
      .setLabel(L("Clear All", "Összes törlése"))
      .setStyle(ButtonStyle.Danger);

    const allButtons = [...itemButtons.slice(0, 19), clearButton];
    for (let i = 0; i < allButtons.length; i += 5) {
      const chunk = allButtons.slice(i, i + 5);
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...chunk));
    }

    await interaction.update({
      embeds: [
        {
          title: L(`📋 Message Queue (${queue.length})`, `📋 Üzenet queue (${queue.length})`),
          description: `~~${preview}~~ ${L("removed", "törölve")}\n\n${list}`,
          color: 0x5865f2,
        },
      ],
      components: rows,
    });
    return;
  }

  if (action === "mapping-remove") {
    const channelId = requestId;
    const project = getProject(channelId);
    if (!project) {
      const projects = getAllProjects(interaction.guildId!);
      await interaction.update({
        content: L("This mapping is already removed.", "Ez a mapping már el lett távolítva."),
        ...renderMappingsPayload(projects, interaction.channelId),
      });
      return;
    }

    await sessionManager.stopSession(channelId);
    unregisterProject(channelId);
    recordOperatorEvent({ kind: "lifecycle", status: "mapping-remove", channelId });
    const projects = getAllProjects(interaction.guildId!);
    await interaction.update({
      content: L(`Removed mapping for <#${channelId}>.`, `<#${channelId}> mapping eltávolítva.`),
      ...renderMappingsPayload(projects, interaction.channelId),
    });
    return;
  }

  if (action === "audit-repair-approve" || action === "audit-repair-deny") {
    if (!getConfig().DISCORD_ENABLE_AUDIT_REPAIR) {
      await interaction.update({
        content: "`audit repair` is disabled. Set `DISCORD_ENABLE_AUDIT_REPAIR=true` in `.env` to enable it.",
        components: [],
      });
      return;
    }

    const job = getAuditJob(requestId);
    if (!job || job.channel_id !== interaction.channelId || job.status !== "waiting_repair_approval") {
      await interaction.update({
        content: L("This audit repair approval request has expired.", "Ez az audit repair jóváhagyási kérés lejárt."),
        components: [],
      });
      return;
    }

    if (action === "audit-repair-deny") {
      updateAuditJobProgress(job.id, "waiting_manual_review", null, job.iteration, new Date().toISOString());
      recordOperatorEvent({ kind: "task", status: "audit-repair-denied", channelId: interaction.channelId });
      await interaction.update({
        content: `Audit repair denied for job \`${job.id.slice(0, 8)}...\`; job remains waiting for manual review.`,
        components: [],
      });
      return;
    }

    const project = getProject(interaction.channelId);
    if (!project) {
      await interaction.update({
        content: L("This channel is not registered to any project.", "Ez a csatorna nincs projekthez regisztrálva."),
        components: [],
      });
      return;
    }

    try {
      updateAuditJobProgress(job.id, "preparing_isolated_worktree", "repair-worktree", job.iteration, new Date().toISOString());
      const prepared = await prepareRepairWorktree({
        sourceRoot: project.project_path,
        jobId: job.id,
      });
      updateAuditJobProgress(job.id, "waiting_manual_review", null, job.iteration, new Date().toISOString());
      recordOperatorEvent({ kind: "task", status: "audit-repair-approved", channelId: interaction.channelId });
      await interaction.update({
        content: [
          `Isolated repair worktree prepared for audit job \`${job.id.slice(0, 8)}...\`.`,
          `Branch: \`${prepared.branchName}\``,
          "Repair execution is not enabled in this slice; no Codex repair turn, merge, commit, or push was started.",
        ].join("\n"),
        components: [],
      });
    } catch {
      updateAuditJobProgress(job.id, "waiting_manual_review", null, job.iteration, new Date().toISOString());
      recordOperatorEvent({ kind: "task", status: "audit-repair-preflight-failed", channelId: interaction.channelId });
      await interaction.update({
        content: "Audit repair preflight failed. The source worktree may be dirty, busy, unsafe, or otherwise not ready; no repair was started.",
        components: [],
      });
    }
    return;
  }

  if (action === "session-delete") {
    if (!getConfig().DISCORD_ENABLE_SESSION_DELETE) {
      await interaction.update({
        content: L(
          "`session-delete` is disabled. Set `DISCORD_ENABLE_SESSION_DELETE=true` in `.env` to enable it.",
          "A `session-delete` ki van kapcsolva.",
        ),
        embeds: [],
        components: [],
      });
      return;
    }

    const channelId = interaction.channelId;
    const deleted = deleteStoredThread(requestId);
    if (deleted) {
      const dbSession = getSession(channelId);
      if (dbSession?.session_id === requestId) {
        const { randomUUID } = await import("node:crypto");
        upsertSession(randomUUID(), channelId, null, "idle");
      }
      recordOperatorEvent({ kind: "lifecycle", status: "session-delete", channelId });

      await interaction.update({
        embeds: [
          {
            title: L("Session Deleted", "Session törölve"),
            description: L(
              `Session \`${requestId.slice(0, 8)}...\` has been deleted.\nYour next message will start a new conversation.`,
              `Session \`${requestId.slice(0, 8)}...\` törölve.\nA következő üzenettől új beszélgetés indul.`
            ),
            color: 0xff6b6b,
          },
        ],
        components: [],
      });
    } else {
      await interaction.update({
        content: L("Failed to delete session.", "A session törlése sikertelen."),
        embeds: [],
        components: [],
      });
    }
    return;
  }

  let decision: "approve" | "deny" | "approve-all";
  if (action === "approve") {
    decision = "approve";
  } else if (action === "deny") {
    decision = "deny";
  } else if (action === "approve-all") {
    decision = "approve-all";
  } else {
    return;
  }

  const resolved = sessionManager.resolveApproval(requestId, decision);
  if (!resolved) {
    await interaction.reply({
      content: L("This approval request has expired.", "Ez a jóváhagyási kérés lejárt."),
      ephemeral: true,
    });
    return;
  }

  const autoApproveEnabled = getConfig().DISCORD_ENABLE_AUTO_APPROVE;
  const labels: Record<string, string> = {
    approve: L("✅ Approved", "✅ Jóváhagyva"),
    deny: L("❌ Denied", "❌ Elutasítva"),
    "approve-all": autoApproveEnabled
      ? L("⚡ Auto-approve enabled for this channel", "⚡ Az auto-jóváhagyás bekapcsolva ebben a csatornában")
      : L("✅ Approved for this request. Auto-approve is disabled in config.", "✅ Csak ez a kérés lett jóváhagyva."),
  };

  await interaction.update({
    content: labels[decision],
    components: [],
  });
}

export async function handleSelectMenuInteraction(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!isAllowedPrincipal(interaction.user.id, interactionRoleIds(interaction))) {
    await interaction.reply({
      content: L("You are not authorized.", "Nincs jogosultság."),
      ephemeral: true,
    });
    return;
  }

  if (interaction.customId.startsWith("ask-select:")) {
    const askRequestId = interaction.customId.slice("ask-select:".length);
    const options = (interaction.component as any).options ?? [];
    const selectedLabels = interaction.values.map((val: string) => {
      const opt = options.find((o: any) => o.value === val);
      return opt?.label ?? val;
    });
    const answer = selectedLabels.join(", ");

    const resolved = sessionManager.resolveQuestion(askRequestId, answer);
    if (!resolved) {
      await interaction.reply({ content: L("This question has expired.", "Ez a kérdés lejárt."), ephemeral: true });
      return;
    }

    await interaction.update({
      content: L(`✅ Selected: **${answer}**`, `✅ Kiválasztva: **${answer}**`),
      embeds: [],
      components: [],
    });
    return;
  }

  if (interaction.customId !== "session-select") return;

  const selectedSessionId = interaction.values[0];

  if (selectedSessionId === "__new_session__") {
    const channelId = interaction.channelId;
    const { randomUUID } = await import("node:crypto");
    upsertSession(randomUUID(), channelId, null, "idle");
    recordOperatorEvent({ kind: "lifecycle", status: "session-new", channelId });

    await interaction.update({
      embeds: [
        {
          title: L("✨ New Session", "✨ Új session"),
          description: L("New session is ready.\nA new conversation will start from your next message.", "Az új session készen áll.\nA következő üzenettől új beszélgetés indul."),
          color: 0x00ff00,
        },
      ],
      components: [],
    });
    return;
  }

  await interaction.deferUpdate();
  const lastMessage = await readLastResponseWithFallback(selectedSessionId);

  const deleteEnabled = getConfig().DISCORD_ENABLE_SESSION_DELETE;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`session-resume:${selectedSessionId}`)
      .setLabel(L("Resume", "Folytatás"))
      .setStyle(ButtonStyle.Success)
      .setEmoji("▶️"),
    new ButtonBuilder()
      .setCustomId(`session-delete:${selectedSessionId}`)
      .setLabel(L("Delete", "Törlés"))
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🗑️")
      .setDisabled(!deleteEnabled),
    new ButtonBuilder()
      .setCustomId(`session-cancel:${selectedSessionId}`)
      .setLabel(L("Cancel", "Mégse"))
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({
    embeds: [
      {
        title: L("Codex Session", "Codex Session"),
        description: [
          `ID: \`${selectedSessionId.slice(0, 8)}...\``,
          lastMessage ? `${L("Last response", "Utolsó válasz")}:\n> ${lastMessage.slice(0, 800)}` : L("No assistant response yet.", "Még nincs assistant válasz."),
        ].join("\n\n"),
        color: 0x5865f2,
      },
    ],
    components: [row],
  });
}
