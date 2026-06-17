import { describe, expect, it, vi } from "vitest";
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

describe("/help and /sugo", () => {
  it("registers the parancs option on both aliases", () => {
    const helpJson = helpData.toJSON();
    const sugoJson = sugoData.toJSON();

    expect(helpJson.name).toBe("help");
    expect(sugoJson.name).toBe("sugo");
    expect(helpJson.options?.[0]?.name).toBe("parancs");
    expect(sugoJson.options?.[0]?.name).toBe("parancs");
  });

  it("lists known commands in Hungarian", async () => {
    const interaction = makeInteraction("help");

    await executeHelp(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("Codex Discord Bot sugo");
    expect(content).toContain("`/ask` - Promptot kuld");
    expect(content).toContain("`/doctor` - Ellenorzi");
    expect(content).toContain("Reszletes sugo: `/help parancs: ask`");
  });

  it("shows detailed help for a selected command", async () => {
    const interaction = makeInteraction("help", "ask");

    await executeHelp(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("**/ask**");
    expect(content).toContain("Hasznalat: `/ask prompt: <szoveg>`");
    expect(content).toContain("A megadott promptot");
  });

  it("uses /sugo as a Hungarian alias", async () => {
    const interaction = makeInteraction("sugo");

    await executeSugo(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("Reszletes sugo: `/sugo parancs: ask`");
  });
});
