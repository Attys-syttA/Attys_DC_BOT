import { REST, Routes } from "discord.js";
import type { Config } from "../utils/config.js";
import { HELP_ENTRIES } from "./commands/help-data.js";

interface DiscordCommandRecord {
  name?: unknown;
}

function ok(label: string): string {
  return `OK ${label}`;
}

function fail(label: string, detail: string): string {
  return `FAIL ${label}: ${detail}`;
}

function info(label: string): string {
  return `INFO ${label}`;
}

function commandList(names: string[]): string {
  const visible = names.slice(0, 12).map((name) => (
    name.includes(" ") ? `"${name}"` : `/${name}`
  )).join(", ");
  return names.length > 12 ? `${visible}, ...` : visible;
}

export function expectedCommandNames(): string[] {
  return [...HELP_ENTRIES.map((entry) => entry.name), "Send to Codex"].sort();
}

export function summarizeRegisteredCommandNames(
  registeredNames: string[],
  expectedNames = expectedCommandNames(),
): string[] {
  const registered = [...new Set(registeredNames.map((name) => name.trim().toLowerCase()).filter(Boolean))].sort();
  const expected = [...new Set(expectedNames.map((name) => name.trim().toLowerCase()).filter(Boolean))].sort();
  const missing = expected.filter((name) => !registered.includes(name));
  const extra = registered.filter((name) => !expected.includes(name));

  if (missing.length === 0 && extra.length === 0) {
    return [ok(`application command registration ${registered.length}/${expected.length}`)];
  }

  const lines = [info(`application command registration ${registered.length}/${expected.length}`)];
  if (missing.length > 0) {
    lines.push(fail("missing application commands", commandList(missing)));
  }
  if (extra.length > 0) {
    lines.push(info(`extra application commands: ${commandList(extra)}`));
  }
  return lines;
}

export async function inspectDiscordCommandRegistration(config: Config): Promise<string[]> {
  try {
    const rest = new REST({ version: "10" }).setToken(config.DISCORD_BOT_TOKEN);
    const applicationId = config.DISCORD_APPLICATION_ID ||
      (await rest.get(Routes.currentApplication()) as { id: string }).id;
    const commands = await rest.get(
      Routes.applicationGuildCommands(applicationId, config.DISCORD_GUILD_ID),
    ) as DiscordCommandRecord[];
    const names = commands
      .map((command) => command.name)
      .filter((name): name is string => typeof name === "string");
    return summarizeRegisteredCommandNames(names);
  } catch {
    return [info("application command registration live check unavailable")];
  }
}
