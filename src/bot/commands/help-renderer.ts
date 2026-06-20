import { HELP_ENTRIES, findHelpEntry } from "./help-data.js";

const CATEGORY_LABELS = {
  codex: "Codex work",
  sessions: "Sessions and queue",
  repo: "Repo and mappings",
  ops: "Operator diagnostics",
  safety: "Gated safety controls",
} as const;

const CATEGORY_ORDER = ["codex", "sessions", "repo", "ops", "safety"] as const;
const HELP_LIST_DESCRIPTION_MAX = 58;

function compactDescription(value: string): string {
  return value.length > HELP_LIST_DESCRIPTION_MAX
    ? `${value.slice(0, HELP_LIST_DESCRIPTION_MAX - 3)}...`
    : value;
}

export function commandChoices() {
  return HELP_ENTRIES
    .filter((entry) => entry.name !== "sugo")
    .map((entry) => ({ name: entry.name, value: entry.name }));
}

export function renderHelpList(commandName: string): string {
  const entries = HELP_ENTRIES.filter((entry) => entry.name !== "sugo");
  const lines: string[] = [];
  for (const category of CATEGORY_ORDER) {
    const group = entries.filter((entry) => entry.category === category);
    if (group.length === 0) continue;
    lines.push(`**${CATEGORY_LABELS[category]}**`);
    lines.push(...group.map((entry) => `- \`/${entry.name}\` - ${compactDescription(entry.short)}`));
    lines.push("");
  }

  return [
    "**Attys DC BOT sugo**",
    "Kezdes: `/dashboard`, `/health`, `/events`, `/logs`.",
    "",
    ...lines,
    `Reszletes: \`/${commandName} parancs: ask\``,
  ].join("\n");
}

export function renderHelpDetail(entryName: string): string {
  const entry = findHelpEntry(entryName);
  if (!entry) {
    return [
      "**Nincs ilyen ismert parancs.**",
      "",
      "Hasznald a `/help` vagy `/sugo` parancsot a listahoz.",
    ].join("\n");
  }

  return [
    `**/${entry.name}**`,
    `Kategoria: ${CATEGORY_LABELS[entry.category]}`,
    "",
    `Hasznalat: \`${entry.usage}\``,
    "",
    entry.short,
    "",
    ...entry.details.map((line) => `- ${line}`),
  ].join("\n");
}
