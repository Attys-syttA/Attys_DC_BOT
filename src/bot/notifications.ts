import type { Client } from "discord.js";
import type { Config } from "../utils/config.js";

export function buildStartupNotification(config: Config): string {
  const messagePromptMode = config.DISCORD_ENABLE_MESSAGE_PROMPTS
    ? "message prompt mode: enabled"
    : "message prompt mode: slash commands only";
  const commandRegistration = config.DISCORD_REGISTER_COMMANDS
    ? "slash command registration: enabled"
    : "slash command registration: skipped";

  return [
    "Codex Discord Bot online.",
    messagePromptMode,
    commandRegistration,
  ].join("\n");
}

export async function sendStartupNotification(
  client: Client,
  config: Config,
): Promise<void> {
  if (!config.DISCORD_NOTIFICATION_CHANNEL_ID) return;

  const channel = await client.channels.fetch(config.DISCORD_NOTIFICATION_CHANNEL_ID);
  if (!channel?.isSendable()) {
    console.warn("Configured Discord notification channel is not sendable.");
    return;
  }

  await channel.send(buildStartupNotification(config));
}
