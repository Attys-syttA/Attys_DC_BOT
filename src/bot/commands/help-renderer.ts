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
const TOPIC_CHOICES = [
  { name: "kezdetek", value: "kezdetek" },
  { name: "fajlfeltoltes", value: "fajlfeltoltes" },
];

function compactDescription(value: string): string {
  return value.length > HELP_LIST_DESCRIPTION_MAX
    ? `${value.slice(0, HELP_LIST_DESCRIPTION_MAX - 3)}...`
    : value;
}

export function commandChoices() {
  const commandEntries = HELP_ENTRIES
    .filter((entry) => entry.name !== "sugo")
    .map((entry) => ({ name: entry.name, value: entry.name }));
  return [...TOPIC_CHOICES, ...commandEntries];
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
    `Elso lepesek: \`/${commandName} parancs: kezdetek\``,
    `Fajlfeltoltes: \`/${commandName} parancs: fajlfeltoltes\``,
    `Reszletes parancs: \`/${commandName} parancs: ask\``,
  ].join("\n");
}

export function renderHelpDetail(entryName: string): string {
  const normalizedEntryName = entryName.trim().toLowerCase();
  if (normalizedEntryName === "kezdetek") {
    return renderGettingStartedHelp();
  }
  if (normalizedEntryName === "fajlfeltoltes") {
    return renderFileUploadHelp();
  }

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

export function renderGettingStartedHelp(): string {
  return [
    "**Kezdetek: tavoli repo-munka Codex agenttel**",
    "",
    "Cel: nem PC-n futo chat sessionhoz csatlakozol, hanem Discordbol iranyitod a helyi Codex agentet egy repo fejlesztesen.",
    "",
    "**1. Bot es kornyezet ellenorzes**",
    "- `/health` - latod, fut-e a bot, van-e error log, es szinkronban van-e a bot repo.",
    "- `/doctor` - ellenorzi a Codex login, slash parancsok es channel readiness allapotat.",
    "",
    "**2. Repo csatorna kijelolese**",
    "- Menj abba a Discord csatornaba, amit ehhez a repohoz hasznalni akarsz.",
    "- `/register path: <repo-mappa>` - osszekoti a csatornat a helyi repo mappaval.",
    "- `/dashboard` - ellenorizd: jo project, nincs aktiv varakozo operatori dontes.",
    "",
    "**3. Munka inditasa**",
    "- `/ask prompt: <feladat>` - ezzel indits fejlesztest, hibajavitast vagy vizsgalatot.",
    "- Ha fajlt adsz, hasznald a `file`, `file2`, `file3` mezoket.",
    "- Ha a Discord kliens nem ajanl fel fajlvalasztot: toltsd fel normal uzenetkent, majd az uzeneten `Apps` -> `Send to Codex`.",
    "- Ha mar fut munka, a bot sorba tudja allitani a kovetkezo promptot.",
    "",
    "**4. Munka kovetese es iranyitasa**",
    "- `/events` - rovid timeline: indulas, kerdes, approval, task eredmeny.",
    "- `/logs source: error` - hiba gyanunal scrubbolt error log.",
    "- `/last` - visszahozza az utolso ismert Codex valaszt.",
    "- `/stop` vagy `/session stop` - ha rossz iranyba ment vagy meg kell allitani.",
    "",
    "**5. Session kezeles**",
    "- `/sessions` - regi helyi Codex thread keresese vagy resume.",
    "- `/session new` - tiszta uj Codex thread a kovetkezo prompthoz.",
    "- Tavoli munkanal altalaban eleg: `/dashboard`, `/ask`, `/events`, `/last`.",
    "",
    "**Fontos**",
    "- Ne kuldj tokeneket vagy privat kulcsokat promptban.",
    "- A bot a helyi gepen dolgozik, a regisztralt repo mappaban.",
    "- Ha bizonytalan vagy: `/health`, aztan `/doctor`, aztan `/dashboard`.",
  ].join("\n");
}

export function renderFileUploadHelp(): string {
  return [
    "**Fajlfeltoltes Codexnek**",
    "",
    "**Ajanlott tavoli modszer**",
    "- Toltsd fel a fajlt normal Discord uzenetkent.",
    "- Irhatsz melle szoveget, peldaul: `file: nezd at ezt a logot`.",
    "- Az elkuldott uzeneten valaszd: `Apps` / `Alkalmazasok` -> `Send to Codex`.",
    "- A bot a fajlt a repo `.codex-uploads` mappajaba menti, es a helyi pathot csak Codexnek adja at.",
    "- Ez mukodik akkor is, ha `DISCORD_ENABLE_MESSAGE_PROMPTS=false`, mert explicit application command.",
    "",
    "**Slash command modszer**",
    "- `/ask prompt: <utasitas>` utan a `file`, `file2`, `file3` mezokkel is adhatsz attachmentet.",
    "- Ha csak azt latod, hogy a Discord beirja: `file:`, de nem nyit fajlvalasztot, hasznald inkabb a fenti `Send to Codex` modszert.",
    "",
    "**Opcionális normal attachment message mod**",
    "- Ha `DISCORD_ENABLE_ATTACHMENT_MESSAGES=true`, egy regisztralt csatornaban a normal szoveg + attachment uzenet is Codex prompt lehet.",
    "- Csak attachment szoveges utasitas nelkul nem indul el: a bot visszairja, hogy adj promptot vagy hasznald a `Send to Codex` modszert.",
    "- Ehhez Discord oldalon a Message Content intent is kellhet.",
    "",
    "**Korlatok**",
    "- Legfeljebb 25 MB fajlonkent.",
    "- Veszelyes futtathato tipusokat a bot blokkol.",
    "- Ne tolts fel tokent, privat kulcsot vagy mas titkot.",
  ].join("\n");
}
