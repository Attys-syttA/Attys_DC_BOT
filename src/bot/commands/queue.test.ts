import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  getQueue: vi.fn(),
  clearQueue: vi.fn(),
  removeFromQueue: vi.fn(),
}));

vi.mock("../../db/database.js", () => ({
  getProject: mocks.getProject,
}));

vi.mock("../../codex/session-manager.js", () => ({
  sessionManager: {
    getQueue: mocks.getQueue,
    clearQueue: mocks.clearQueue,
    removeFromQueue: mocks.removeFromQueue,
  },
}));

import { execute } from "./queue.js";

function makeInteraction(subcommand: string, number = 1) {
  return {
    channelId: "channel-1",
    options: {
      getSubcommand: vi.fn(() => subcommand),
      getInteger: vi.fn(() => number),
    },
    editReply: vi.fn(),
  };
}

describe("/queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProject.mockReturnValue({ channel_id: "channel-1", project_path: "/projects/app" });
    mocks.getQueue.mockReturnValue([]);
    mocks.clearQueue.mockReturnValue(2);
    mocks.removeFromQueue.mockReturnValue("queued prompt");
  });

  it("rejects unregistered channels", async () => {
    mocks.getProject.mockReturnValue(undefined);
    const interaction = makeInteraction("list");

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "This channel is not registered to any project.",
    });
  });

  it("lists queued prompts", async () => {
    mocks.getQueue.mockReturnValue([{ prompt: "first" }, { prompt: "second" }]);
    const interaction = makeInteraction("list");

    await execute(interaction as never);

    const payload = interaction.editReply.mock.calls[0][0];
    expect(payload.embeds[0].title).toBe("📋 Message Queue (2)");
    expect(payload.embeds[0].description).toContain("**1.** first");
    expect(payload.components.length).toBeGreaterThan(0);
  });

  it("removes a queued prompt by one-based number", async () => {
    const interaction = makeInteraction("remove", 2);

    await execute(interaction as never);

    expect(mocks.removeFromQueue).toHaveBeenCalledWith("channel-1", 1);
    expect(interaction.editReply.mock.calls[0][0].embeds[0].description).toContain("Removed item 2");
  });

  it("reports missing queue item on remove", async () => {
    mocks.removeFromQueue.mockReturnValue(null);
    const interaction = makeInteraction("remove", 9);

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "No queued message exists with that number.",
    });
  });

  it("clears queued prompts", async () => {
    const interaction = makeInteraction("clear");

    await execute(interaction as never);

    expect(mocks.clearQueue).toHaveBeenCalledWith("channel-1");
    expect(interaction.editReply.mock.calls[0][0].embeds[0].description).toBe("Cleared 2 queued message(s).");
  });
});
