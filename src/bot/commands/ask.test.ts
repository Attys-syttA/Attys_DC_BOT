import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  checkRateLimit: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock("../../db/database.js", () => ({
  getProject: mocks.getProject,
}));

vi.mock("../../security/guard.js", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("../../codex/session-manager.js", () => ({
  sessionManager: {
    sendMessage: mocks.sendMessage,
  },
}));

import { execute } from "./ask.js";

function makeInteraction(prompt: string) {
  return {
    channelId: "channel-1",
    user: { id: "user-1" },
    channel: {
      isTextBased: () => true,
      isDMBased: () => false,
    },
    options: {
      getString: vi.fn(() => prompt),
    },
    editReply: vi.fn(),
  };
}

describe("/ask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProject.mockReturnValue({ channel_id: "channel-1", project_path: "/projects/app" });
    mocks.checkRateLimit.mockReturnValue(true);
  });

  it("rejects unregistered channels", async () => {
    mocks.getProject.mockReturnValue(undefined);
    const interaction = makeInteraction("hello");

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "This channel is not registered to any project.",
    });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("sends a trimmed prompt to the local session manager", async () => {
    const interaction = makeInteraction("  inspect this repo  ");

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Prompt sent to local Codex.",
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith(interaction.channel, "inspect this repo");
  });
});
