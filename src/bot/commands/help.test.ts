import { describe, expect, it, vi } from "vitest";
import type { APIApplicationCommandOptionChoice } from "discord.js";
import { execute as executeHelp, data as helpData } from "./help.js";
import { execute as executeSugo, data as sugoData } from "./sugo.js";

function makeInteraction(commandName: "help" | "sugo", selected: string | null = null) {
  return {
    commandName,
    options: {
      getString: vi.fn(() => selected),
    },
    editReply: vi.fn(),
  };
}

function firstChoice(commandJson: ReturnType<typeof helpData.toJSON>): APIApplicationCommandOptionChoice<string> | undefined {
  const option = commandJson.options?.[0] as { choices?: APIApplicationCommandOptionChoice<string>[] } | undefined;
  return option?.choices?.[0];
}

describe("/help and /sugo", () => {
  it("registers the parancs option on both aliases", () => {
    const helpJson = helpData.toJSON();
    const sugoJson = sugoData.toJSON();

    expect(helpJson.name).toBe("help");
    expect(sugoJson.name).toBe("sugo");
    expect(helpJson.options?.[0]?.name).toBe("parancs");
    expect(sugoJson.options?.[0]?.name).toBe("parancs");
    expect(firstChoice(helpJson)).toMatchObject({
      name: "kezdetek",
      value: "kezdetek",
    });
    expect(firstChoice(sugoJson)).toMatchObject({
      name: "kezdetek",
      value: "kezdetek",
    });
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
    expect(content).toContain("`/doctor` - Ellenorzi");
    expect(content).toContain("Elso lepesek: `/help parancs: kezdetek`");
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

  it("uses /sugo as a Hungarian alias", async () => {
    const interaction = makeInteraction("sugo");

    await executeSugo(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content.length).toBeLessThanOrEqual(2000);
    expect(content).toContain("Reszletes parancs: `/sugo parancs: ask`");
  });
});
