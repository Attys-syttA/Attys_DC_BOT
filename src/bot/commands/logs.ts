import fs from "node:fs";
import path from "node:path";
import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { sanitizePublicText } from "../../utils/public-safety.js";

export type LogSource = "bot" | "error" | "operator-tools" | "events" | "update";

const LOG_SOURCES: Record<LogSource, string> = {
  bot: "bot.log",
  error: "bot.err.log",
  "operator-tools": "operator-startup.log",
  events: "operator-events.log",
  update: "update.log",
};

export const data = new SlashCommandBuilder()
  .setName("logs")
  .setDescription("Show a public-safe tail from local bot logs")
  .addStringOption((option) => option
    .setName("source")
    .setDescription("Which local log to inspect")
    .setRequired(true)
    .addChoices(
      { name: "bot", value: "bot" },
      { name: "error", value: "error" },
      { name: "operator-tools", value: "operator-tools" },
      { name: "events", value: "events" },
      { name: "update", value: "update" },
    ))
  .addIntegerOption((option) => option
    .setName("lines")
    .setDescription("Number of lines to show")
    .setMinValue(1)
    .setMaxValue(30))
  .addStringOption((option) => option
    .setName("contains")
    .setDescription("Optional public-safe text filter")
    .setRequired(false));

function clampLineCount(value: number): number {
  return Math.max(1, Math.min(30, value));
}

export function sanitizeLogLine(line: string): string {
  return sanitizePublicText(line, 240);
}

export function readPublicLogLines(
  repoRoot: string,
  source: LogSource,
  lineCount = 12,
  contains?: string | null,
): string[] {
  const filename = LOG_SOURCES[source];
  if (!filename) return [];
  const filter = contains?.trim().toLowerCase() ?? "";

  try {
    return fs.readFileSync(path.join(repoRoot, filename), "utf8")
      .split(/\r?\n/)
      .map(sanitizeLogLine)
      .filter(Boolean)
      .filter((line) => !filter || line.toLowerCase().includes(filter))
      .slice(-clampLineCount(lineCount));
  } catch {
    return [];
  }
}

function compactCodeBlock(lines: string[]): string {
  const joined = lines.join("\n");
  if (joined.length <= 1750) return joined;
  return `...${joined.slice(joined.length - 1750)}`;
}

export function buildLogsReply(source: LogSource, lines: string[], contains?: string | null): string {
  const filter = sanitizeLogLine(contains ?? "");
  return [
    `**Attys DC BOT Logs** (${source}${filter ? `, contains: ${filter}` : ""})`,
    lines.length > 0
      ? `\`\`\`text\n${compactCodeBlock(lines)}\n\`\`\``
      : "No public-safe lines found for this log source.",
  ].join("\n");
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const source = (interaction.options.getString("source", true) ?? "bot") as LogSource;
  const lines = interaction.options.getInteger("lines") ?? 12;
  const contains = interaction.options.getString("contains", false);
  await interaction.editReply({
    content: buildLogsReply(source, readPublicLogLines(process.cwd(), source, lines, contains), contains),
  });
}
