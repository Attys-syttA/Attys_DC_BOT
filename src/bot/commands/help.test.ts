import { describe, expect, it, vi } from "vitest";
import { execute as executeHelp, data as helpData, autocomplete as autocompleteHelp } from "./help.js";
import { execute as executeSugo, data as sugoData, autocomplete as autocompleteSugo } from "./sugo.js";

function makeInteraction(commandName: "help" | "sugo", selected: string | null = null) {
  return {
    commandName,
    options: {
      getString: vi.fn(() => selected),
    },
    editReply: vi.fn(),
  };
}

describe("/help and /sugo", () => {
  it("registers the parancs autocomplete option on both aliases", () => {
    const helpJson = helpData.toJSON();
    const sugoJson = sugoData.toJSON();

    expect(helpJson.name).toBe("help");
    expect(sugoJson.name).toBe("sugo");
    expect(helpJson.options?.[0]?.name).toBe("parancs");
    expect(sugoJson.options?.[0]?.name).toBe("parancs");
    expect(helpJson.options?.[0]).toMatchObject({ autocomplete: true });
    expect(sugoJson.options?.[0]).toMatchObject({ autocomplete: true });
  });

  it("keeps help autocomplete under the Discord 25-choice limit", async () => {
    const interaction = {
      options: {
        getFocused: vi.fn(() => ""),
      },
      respond: vi.fn(),
    };

    await autocompleteHelp(interaction as never);
    await autocompleteSugo(interaction as never);

    expect(interaction.respond.mock.calls[0][0].length).toBeLessThanOrEqual(25);
    expect(interaction.respond.mock.calls[0][0]).toContainEqual({ name: "kezdetek", value: "kezdetek" });
    expect(interaction.respond.mock.calls[1][0].length).toBeLessThanOrEqual(25);
  });

  it("lists known commands in Hungarian", async () => {
    const interaction = makeInteraction("help");

    await executeHelp(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content.length).toBeLessThanOrEqual(2000);
    expect(content).toContain("Attys DC BOT sugo");
    expect(content).toContain("Kezdes: `/dashboard`, `/health`, `/events`, `/logs`.");
    expect(content).toContain("**Codex work**");
    expect(content).toContain("**Operator diagnostics**");
    expect(content).toContain("`/ask` - Promptot es opcionális fajlt kuld");
    expect(content).toContain("`/audit` - Fix, read-only audit checkeket futtat");
    expect(content).toContain("`/nas` - Public-safe NAS bridge");
    expect(content).toContain("`/doctor` - Ellenorzi");
    expect(content).toContain("Elso lepesek: `/help parancs: kezdetek`");
    expect(content).toContain("Fajlfeltoltes: `/help parancs: fajlfeltoltes`");
    expect(content).toContain("Reszletes parancs: `/help parancs: ask`");
  });

  it("shows detailed help for a selected command", async () => {
    const interaction = makeInteraction("help", "ask");

    await executeHelp(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("**/ask**");
    expect(content).toContain("Kategoria: Codex work");
    expect(content).toContain("Hasznalat: `/ask prompt: <szoveg> file/file2/file3: <opcionalis>`");
    expect(content).toContain("A megadott promptot");
    expect(content).toContain("Send to Codex");
  });

  it("shows detailed help for the NAS bridge command", async () => {
    const interaction = makeInteraction("help", "nas");

    await executeHelp(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("**/nas**");
    expect(content).toContain("/nas status");
    expect(content).toContain("/nas request");
    expect(content).toContain("/nas results");
    expect(content).toContain("DISCORD_ENABLE_NAS_STATUS=true");
    expect(content).toContain("DISCORD_ENABLE_NAS_HANDOFF=true");
    expect(content).toContain("DISCORD_ENABLE_NAS_BRIDGE_LIFECYCLE=true");
  });

  it("explains the /register autocomplete limit", async () => {
    const interaction = makeInteraction("help", "register");

    await executeHelp(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("Discord autocomplete legfeljebb 25 talalatot mutat");
    expect(content).toContain("r_cube");
    expect(content).toContain("solution");
  });

  it("shows a getting-started workflow topic for remote repo work", async () => {
    const interaction = makeInteraction("sugo", "kezdetek");

    await executeSugo(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content.length).toBeLessThanOrEqual(2000);
    expect(content).toContain("Kezdetek: tavoli repo-munka Codex agenttel");
    expect(content).toContain("/register path: <repo-mappa>");
    expect(content).toContain("/ask prompt: <feladat>");
    expect(content).toContain("/events");
    expect(content).toContain("/session new");
    expect(content).toContain("nem PC-n futo chat sessionhoz csatlakozol");
  });

  it("shows a file-upload workflow topic", async () => {
    const interaction = makeInteraction("sugo", "fajlfeltoltes");

    await executeSugo(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content.length).toBeLessThanOrEqual(2000);
    expect(content).toContain("Fajlfeltoltes Codexnek");
    expect(content).toContain("Send to Codex");
    expect(content).toContain("file: nezd at ezt a logot");
    expect(content).toContain("25 MB");
  });

  it("uses /sugo as a Hungarian alias", async () => {
    const interaction = makeInteraction("sugo");

    await executeSugo(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content.length).toBeLessThanOrEqual(2000);
    expect(content).toContain("Reszletes parancs: `/sugo parancs: ask`");
  });
});
