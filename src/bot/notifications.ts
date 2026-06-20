import type { Client } from "discord.js";
import type { Config } from "../utils/config.js";

type StartupNotificationOptions = {
  botTag?: string;
  commandCount?: number;
  launchReason?: string;
  operatorToolsStatus?: string;
};

function safeLaunchReason(value: string | undefined): string {
  if (!value) return "unknown start";
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "windows-launcher":
      return "Windows launcher start";
    case "windows-foreground":
      return "Windows foreground diagnostics";
    case "windows-tray-start":
      return "Windows tray start";
    case "windows-tray-restart":
      return "Windows tray restart";
    case "windows-safe-update":
      return "Windows safe update restart";
    default:
      return "manual or external start";
  }
}

export function buildStartupNotification(
  config: Config,
  options: StartupNotificationOptions = {},
): string {
  const messagePromptMode = config.DISCORD_ENABLE_MESSAGE_PROMPTS
    ? "message prompt mode: enabled"
    : "message prompt mode: slash commands only";
  const commandRegistration = config.DISCORD_REGISTER_COMMANDS
    ? "slash command registration: enabled"
    : "slash command registration: skipped";
  const commandCount = typeof options.commandCount === "number"
    ? `slash commands loaded: ${options.commandCount}`
    : "slash commands loaded: unknown";
  const botTag = options.botTag ? `bot user: ${options.botTag}` : "bot user: unknown";
  const launchReason = `launch reason: ${safeLaunchReason(options.launchReason)}`;
  const operatorTools = `operator tools: ${safeOperatorToolsStatus(options.operatorToolsStatus)}`;

  return [
    "Attys DC BOT online.",
    launchReason,
    botTag,
    operatorTools,
    messagePromptMode,
    commandRegistration,
    commandCount,
  ].join("\n");
}

function safeOperatorToolsStatus(value: string | undefined): string {
  switch ((value ?? "").trim().toLowerCase()) {
    case "ready":
      return "ready";
    case "failed":
      return "failed";
    case "skipped":
      return "skipped";
    case "running":
      return "running";
    default:
      return "unknown";
  }
}

export async function sendStartupNotification(
  client: Client,
  config: Config,
  options: StartupNotificationOptions = {},
): Promise<void> {
  if (!config.DISCORD_NOTIFICATION_CHANNEL_ID) return;

  const channel = await client.channels.fetch(config.DISCORD_NOTIFICATION_CHANNEL_ID);
  if (!channel?.isSendable()) {
    console.warn("Configured Discord notification channel is not sendable.");
    return;
  }

  await channel.send(buildStartupNotification(config, {
    botTag: client.user?.tag,
    commandCount: options.commandCount,
    launchReason: process.env.ATTYS_BOT_LAUNCH_REASON,
    operatorToolsStatus: process.env.ATTYS_OPERATOR_TOOLS_STATUS,
  }));
}
