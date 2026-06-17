import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Collection,
  type ChatInputCommandInteraction,
  type Interaction,
} from "discord.js";
import { getConfig } from "../utils/config.js";
import { handleMessage } from "./handlers/message.js";
import { handleButtonInteraction, handleSelectMenuInteraction } from "./handlers/interaction.js";
import { isAllowedPrincipal } from "../security/guard.js";
import { L } from "../utils/i18n.js";
import { sendStartupNotification } from "./notifications.js";
import * as registerCmd from "./commands/register.js";
import * as unregisterCmd from "./commands/unregister.js";
import * as statusCmd from "./commands/status.js";
import * as stopCmd from "./commands/stop.js";
import * as autoApproveCmd from "./commands/auto-approve.js";
import * as sessionsCmd from "./commands/sessions.js";
import * as clearSessionsCmd from "./commands/clear-sessions.js";
import * as lastCmd from "./commands/last.js";
import * as queueCmd from "./commands/queue.js";
import * as usageCmd from "./commands/usage.js";
import * as askCmd from "./commands/ask.js";
import * as doctorCmd from "./commands/doctor.js";
import * as gitStatusCmd from "./commands/git-status.js";
import * as runTestsCmd from "./commands/run-tests.js";
import * as dashboardCmd from "./commands/dashboard.js";
import * as sessionCmd from "./commands/session.js";
import * as helpCmd from "./commands/help.js";
import * as sugoCmd from "./commands/sugo.js";

const commands = [
  registerCmd,
  unregisterCmd,
  statusCmd,
  stopCmd,
  autoApproveCmd,
  sessionsCmd,
  clearSessionsCmd,
  lastCmd,
  queueCmd,
  usageCmd,
  askCmd,
  doctorCmd,
  gitStatusCmd,
  runTestsCmd,
  dashboardCmd,
  sessionCmd,
  helpCmd,
  sugoCmd,
];
const commandMap = new Collection<
  string,
  { execute: (interaction: ChatInputCommandInteraction) => Promise<void> }
>();

for (const cmd of commands) {
  commandMap.set(cmd.data.name, cmd);
}

function interactionRoleIds(interaction: Interaction): string[] {
  const roles = interaction.member?.roles;
  if (!roles) return [];
  if (Array.isArray(roles)) return roles;
  if ("cache" in roles) return [...roles.cache.keys()];
  return [];
}

export async function startBot(): Promise<Client> {
  const config = getConfig();
  const intents = [GatewayIntentBits.Guilds];
  if (config.DISCORD_ENABLE_MESSAGE_PROMPTS) {
    intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
  }

  const client = new Client({
    intents,
  });

  client.on("ready", async () => {
    console.log(`Bot logged in as ${client.user?.tag}`);
    if (config.DISCORD_REGISTER_COMMANDS) {
      try {
        const rest = new REST({ version: "10" }).setToken(config.DISCORD_BOT_TOKEN);
        const commandData = commands.map((c) => c.data.toJSON());
        const applicationId =
          config.DISCORD_APPLICATION_ID ||
          (await rest.get(Routes.currentApplication()) as { id: string }).id;
        await rest.put(
          Routes.applicationGuildCommands(
            applicationId,
            config.DISCORD_GUILD_ID,
          ),
          { body: commandData },
        );
        console.log(`Registered ${commandData.length} slash commands`);
      } catch (error) {
        console.error("Failed to register slash commands:", error);
      }
    } else {
      console.log("Slash command registration skipped (DISCORD_REGISTER_COMMANDS=false)");
    }
    try {
      await sendStartupNotification(client, config);
    } catch (error) {
      console.error("Failed to send startup notification:", error);
    }
  });

  client.on("interactionCreate", async (interaction: Interaction) => {
    try {
      if (interaction.isAutocomplete()) {
        const command = commandMap.get(interaction.commandName);
        if (command && "autocomplete" in command) {
          await (command as any).autocomplete(interaction);
        }
        return;
      }

      if (interaction.isChatInputCommand()) {
        if (!isAllowedPrincipal(interaction.user.id, interactionRoleIds(interaction))) {
          await interaction.reply({
            content: L("You are not authorized to use this bot.", "이 봇을 사용할 권한이 없습니다."),
            flags: ["Ephemeral"],
          });
          return;
        }

        await interaction.deferReply();

        const command = commandMap.get(interaction.commandName);
        if (command) {
          await command.execute(interaction);
        }
      } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
      } else if (interaction.isStringSelectMenu()) {
        await handleSelectMenuInteraction(interaction);
      }
    } catch (error) {
      console.error("Interaction error:", error);
      const content = L("An error occurred while processing your command.", "명령을 처리하는 중 오류가 발생했습니다.");
      try {
        if (interaction.isRepliable()) {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content, flags: ["Ephemeral"] });
          } else {
            await interaction.reply({ content, flags: ["Ephemeral"] });
          }
        }
      } catch {
        // ignore
      }
    }
  });

  client.on("messageCreate", async (message) => {
    try {
      await handleMessage(message);
    } catch (error) {
      console.error("messageCreate error:", error);
      try {
        if (message.channel.isSendable()) {
          await message.reply(L("An error occurred while processing your message.", "메시지를 처리하는 중 오류가 발생했습니다."));
        }
      } catch {
        // ignore
      }
    }
  });

  client.on("error", (error) => {
    console.error("Discord client error:", error);
  });
  client.on("warn", (warning) => {
    console.warn("Discord warning:", warning);
  });
  client.on("shardDisconnect", (event, shardId) => {
    console.warn(`Shard ${shardId} disconnected (code ${event.code}). Reconnecting...`);
  });
  client.on("shardReconnecting", (shardId) => {
    console.log(`Shard ${shardId} reconnecting...`);
  });
  client.on("shardResume", (shardId, replayedEvents) => {
    console.log(`Shard ${shardId} resumed (${replayedEvents} events replayed)`);
  });
  client.on("shardError", (error, shardId) => {
    console.error(`Shard ${shardId} error:`, error);
  });

  await loginWithRetry(client, config.DISCORD_BOT_TOKEN);
  return client;
}

async function loginWithRetry(client: Client, token: string): Promise<void> {
  const delays = [5, 10, 15, 30, 30, 30];
  let attempt = 0;

  while (true) {
    try {
      await client.login(token);
      if (attempt > 0) {
        console.log(`Discord login successful after ${attempt} retries`);
      }
      return;
    } catch (error) {
      attempt++;
      const delay = delays[Math.min(attempt - 1, delays.length - 1)];
      console.error(`Discord login attempt ${attempt} failed: ${(error as Error).message}`);
      console.error(`Retrying in ${delay}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay * 1000));
    }
  }
}
