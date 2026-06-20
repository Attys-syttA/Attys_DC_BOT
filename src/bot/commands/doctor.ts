import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import fs from "node:fs";
import { getProject, getProjectsByPath } from "../../db/database.js";
import { resolveCodexCommand } from "../../codex/command-resolver.js";
import { getConfig } from "../../utils/config.js";
import { runLocalCommand } from "./local-command.js";
import { expectedCommandNames, inspectDiscordCommandRegistration } from "../command-surface.js";

function ok(label: string): string {
  return `OK ${label}`;
}

function fail(label: string, detail: string): string {
  return `FAIL ${label}: ${detail}`;
}

function info(label: string): string {
  return `INFO ${label}`;
}

export const data = new SlashCommandBuilder()
  .setName("doctor")
  .setDescription("Check local bot, Codex, and registered project readiness");

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const config = getConfig();
  const lines: string[] = [];

  lines.push(config.DISCORD_APPLICATION_ID ? ok("DISCORD_APPLICATION_ID configured") : ok("DISCORD_APPLICATION_ID omitted, bot will query Discord when registering commands"));
  lines.push(config.DISCORD_GUILD_ID ? ok("DISCORD_GUILD_ID configured") : fail("DISCORD_GUILD_ID", "missing"));
  lines.push(config.DISCORD_NOTIFICATION_CHANNEL_ID ? ok("notification channel configured") : info("notification channel not configured"));
  lines.push(config.ALLOWED_USER_IDS.length > 0 || config.ALLOWED_ROLE_IDS.length > 0 ? ok("allowed principals configured") : fail("allowed principals", "no users or roles configured"));
  lines.push(fs.existsSync(config.BASE_PROJECT_DIR) ? ok("BASE_PROJECT_DIR exists") : fail("BASE_PROJECT_DIR", "path does not exist"));
  lines.push(ok(`known application command surface ${expectedCommandNames().length} commands`));
  lines.push(config.DISCORD_REGISTER_COMMANDS ? info("startup application command registration enabled") : info("startup application command registration disabled"));
  lines.push(...await inspectDiscordCommandRegistration(config));
  lines.push(
    config.DISCORD_ENABLE_MESSAGE_PROMPTS
      ? info("message prompts enabled; Discord Message Content intent must be enabled in Developer Portal")
      : info("message prompts disabled; slash commands work without Message Content intent"),
  );

  const project = getProject(interaction.channelId);
  lines.push(project ? ok("this channel is registered") : fail("channel registration", "run /register first"));
  if (project) {
    const projectMappings = getProjectsByPath(project.guild_id, project.project_path);
    lines.push(
      projectMappings.length > 1
        ? info(`project has ${projectMappings.length} channel mappings; old forum/thread mappings may still exist`)
        : ok("project has one channel mapping"),
    );
  }

  const codexCommand = resolveCodexCommand();
  const version = await runLocalCommand(codexCommand, ["--version"], process.cwd(), 10_000);
  lines.push(version.exitCode === 0 ? ok("Codex CLI resolves") : fail("Codex CLI", "command failed"));

  const login = await runLocalCommand(codexCommand, ["login", "status"], process.cwd(), 10_000);
  lines.push(login.exitCode === 0 ? ok("codex login status") : fail("codex login status", "not logged in or command failed"));

  await interaction.editReply({
    content: `**Local Codex Doctor**\n\`\`\`text\n${lines.join("\n")}\n\`\`\``,
  });
}
