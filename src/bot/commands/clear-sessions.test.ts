import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getProject: vi.fn(),
  listStoredThreads: vi.fn(),
  deleteStoredThread: vi.fn(),
}));

vi.mock("../../utils/config.js", () => ({
  getConfig: mocks.getConfig,
}));

vi.mock("../../db/database.js", () => ({
  getProject: mocks.getProject,
}));

vi.mock("../../codex/storage.js", () => ({
  listStoredThreads: mocks.listStoredThreads,
  deleteStoredThread: mocks.deleteStoredThread,
}));

import { execute } from "./clear-sessions.js";

function makeInteraction() {
  return {
    channelId: "channel-1",
    editReply: vi.fn(),
  };
}

describe("/clear-sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_SESSION_DELETE: true });
    mocks.getProject.mockReturnValue({
      channel_id: "channel-1",
      project_path: "/projects/app",
      auto_approve: 0,
    });
    mocks.listStoredThreads.mockReturnValue([
      { id: "thread-1" },
      { id: "thread-2" },
    ]);
    mocks.deleteStoredThread.mockReturnValue(true);
  });

  it("is disabled unless session deletion is explicitly enabled in config", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_SESSION_DELETE: false });
    const interaction = makeInteraction();

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "`/clear-sessions` is disabled. Set `DISCORD_ENABLE_SESSION_DELETE=true` in `.env` to enable it.",
    });
    expect(mocks.listStoredThreads).not.toHaveBeenCalled();
    expect(mocks.deleteStoredThread).not.toHaveBeenCalled();
  });

  it("deletes stored sessions when explicitly enabled", async () => {
    const interaction = makeInteraction();

    await execute(interaction as never);

    expect(mocks.listStoredThreads).toHaveBeenCalledWith("/projects/app");
    expect(mocks.deleteStoredThread).toHaveBeenCalledWith("thread-1");
    expect(mocks.deleteStoredThread).toHaveBeenCalledWith("thread-2");
    const payload = interaction.editReply.mock.calls[0][0];
    expect(payload.embeds[0].description).toContain("Deleted **2** session(s)");
  });
});
