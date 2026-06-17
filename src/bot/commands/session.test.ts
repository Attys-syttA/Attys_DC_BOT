import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  getSession: vi.fn(),
  upsertSession: vi.fn(),
  isActive: vi.fn(),
  stopSession: vi.fn(),
}));

vi.mock("../../db/database.js", () => ({
  getProject: mocks.getProject,
  getSession: mocks.getSession,
  upsertSession: mocks.upsertSession,
}));

vi.mock("../../codex/session-manager.js", () => ({
  sessionManager: {
    isActive: mocks.isActive,
    stopSession: mocks.stopSession,
  },
}));

import { execute } from "./session.js";

function makeInteraction(subcommand: string) {
  return {
    channelId: "channel-1",
    options: {
      getSubcommand: vi.fn(() => subcommand),
    },
    editReply: vi.fn(),
  };
}

describe("/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProject.mockReturnValue({ channel_id: "channel-1", project_path: "/projects/app" });
    mocks.getSession.mockReturnValue({
      session_id: "thread-1",
      status: "idle",
      last_activity: "2026-06-17 20:00:00",
    });
    mocks.isActive.mockReturnValue(false);
    mocks.stopSession.mockResolvedValue(true);
  });

  it("rejects unregistered channels", async () => {
    mocks.getProject.mockReturnValue(undefined);
    const interaction = makeInteraction("current");

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "This channel is not registered to any project. Use `/register` first.",
    });
  });

  it("shows the current session state", async () => {
    const interaction = makeInteraction("current");

    await execute(interaction as never);

    const payload = interaction.editReply.mock.calls[0][0];
    expect(payload.embeds[0].title).toBe("Current Session");
    expect(payload.embeds[0].description).toContain("`/projects/app`");
    expect(payload.embeds[0].description).toContain("`thread-1`");
    expect(payload.embeds[0].description).toContain("**idle**");
  });

  it("marks the next prompt as a fresh session", async () => {
    const interaction = makeInteraction("new");

    await execute(interaction as never);

    expect(mocks.upsertSession).toHaveBeenCalledWith(expect.any(String), "channel-1", null, "idle");
    expect(interaction.editReply.mock.calls[0][0].embeds[0].title).toBe("New Session Ready");
  });

  it("stops the active session", async () => {
    const interaction = makeInteraction("stop");

    await execute(interaction as never);

    expect(mocks.stopSession).toHaveBeenCalledWith("channel-1");
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Stopped the active Codex turn.",
    });
  });
});
