import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import {
  OperatorEventKind,
  readOperatorEvents,
  safeOperatorEventToken,
  summarizeOperatorEvents,
} from "../operator-events.js";

type EventKindOption = OperatorEventKind | "all";

export const data = new SlashCommandBuilder()
  .setName("events")
  .setDescription("Show recent public-safe operator events")
  .addIntegerOption((option) => option
    .setName("limit")
    .setDescription("Number of events to show")
    .setMinValue(1)
    .setMaxValue(25))
  .addStringOption((option) => option
    .setName("kind")
    .setDescription("Filter events by type")
    .addChoices(
      { name: "all", value: "all" },
      { name: "startup", value: "startup" },
      { name: "lifecycle", value: "lifecycle" },
      { name: "attention", value: "attention" },
      { name: "task", value: "task" },
    ))
  .addStringOption((option) => option
    .setName("status")
    .setDescription("Filter by public-safe status text, for example failed or restart"))
  .addBooleanOption((option) => option
    .setName("summary")
    .setDescription("Include a compact event summary"));

function formatSummary(lines: string[]): string {
  const summary = summarizeOperatorEvents(lines);
  const kinds = Object.entries(summary.byKind)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${kind}:${count}`)
    .join(" ");
  const statuses = Object.entries(summary.byStatus)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 5)
    .map(([status, count]) => `${status}:${count}`)
    .join(" ");

  return [
    `summary: total:${summary.total}${kinds ? ` ${kinds}` : ""}`,
    statuses ? `statuses: ${statuses}` : "statuses: none",
  ].join("\n");
}

export function buildEventsReply(
  lines: string[],
  options: { kind?: EventKindOption; status?: string | null; summary?: boolean } = {},
): string {
  const kind = options.kind ?? "all";
  const status = options.status ? safeOperatorEventToken(options.status) : "";
  const filters = [`kind:${kind}`, status ? `status:${status}` : null].filter(Boolean).join(" ");
  return [
    `**Attys DC BOT Events** (${filters})`,
    options.summary ? formatSummary(lines) : null,
    lines.length > 0
      ? `\`\`\`text\n${lines.join("\n")}\n\`\`\``
      : "`operator-events.log` has no public-safe event lines yet.",
  ].filter(Boolean).join("\n");
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const limit = interaction.options.getInteger("limit") ?? 10;
  const kind = (interaction.options.getString("kind") ?? "all") as EventKindOption;
  const status = interaction.options.getString("status");
  const summary = interaction.options.getBoolean("summary") ?? false;
  await interaction.editReply({
    content: buildEventsReply(readOperatorEvents(process.cwd(), limit, kind, status ?? ""), { kind, status, summary }),
  });
}
