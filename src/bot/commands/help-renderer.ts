import { HELP_ENTRIES, findHelpEntry } from "./help-data.js";

export function commandChoices() {
  return HELP_ENTRIES
    .filter((entry) => entry.name !== "sugo")
    .map((entry) => ({ name: entry.name, value: entry.name }));
}

export function renderHelpList(commandName: string): string {
  const lines = HELP_ENTRIES
    .filter((entry) => entry.name !== "sugo")
    .map((entry) => `- \`/${entry.name}\` - ${entry.short}`);

  return [
    "**Codex Discord Bot sugo**",
    "",
    ...lines,
    "",
    `Reszletes sugo: \`/${commandName} parancs: ask\``,
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
    "",
    `Hasznalat: \`${entry.usage}\``,
    "",
    entry.short,
    "",
    ...entry.details.map((line) => `- ${line}`),
  ].join("\n");
}
