import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  isAllowedPrincipal: vi.fn(),
  sessionManager: {
    stopSession: vi.fn(),
    confirmQueue: vi.fn(),
    getQueueSize: vi.fn(),
    cancelQueue: vi.fn(),
    clearQueue: vi.fn(),
    resolveApproval: vi.fn(),
    resolveQuestion: vi.fn(),
  },
  getConfig: vi.fn(),
  upsertSession: vi.fn(),
  getProject: vi.fn(),
  getAllProjects: vi.fn(),
  unregisterProject: vi.fn(),
  readThread: vi.fn(),
  deleteStoredThread: vi.fn(),
}));

vi.mock("../../security/guard.js", () => ({
  isAllowedPrincipal: mocks.isAllowedPrincipal,
}));

vi.mock("../../codex/session-manager.js", () => ({
  sessionManager: mocks.sessionManager,
}));

vi.mock("../../db/database.js", () => ({
  upsertSession: mocks.upsertSession,
  getSession: vi.fn(),
  getProject: mocks.getProject,
  getAllProjects: mocks.getAllProjects,
  unregisterProject: mocks.unregisterProject,
}));

vi.mock("../../codex/app-server-client.js", () => ({
  codexAppServer: {
    readThread: mocks.readThread,
  },
}));

vi.mock("../../codex/storage.js", () => ({
  deleteStoredThread: mocks.deleteStoredThread,
}));

vi.mock("../../utils/config.js", () => ({
  getConfig: mocks.getConfig,
}));

import { handleButtonInteraction, handleSelectMenuInteraction } from "./interaction.js";

function makeButton(customId: string) {
  return {
    customId,
    user: { id: "user-1" },
    member: { roles: { cache: new Map([["role-1", true]]) } },
    channelId: "channel-1",
    component: { label: "Option A" },
    reply: vi.fn(),
    update: vi.fn(),
    followUp: vi.fn(),
  };
}

function makeSelect(customId: string, values: string[]) {
  return {
    customId,
    values,
    user: { id: "user-1" },
    member: { roles: { cache: new Map([["role-1", true]]) } },
    channelId: "channel-1",
    component: { options: [{ value: "value-a", label: "Option A" }] },
    reply: vi.fn(),
    update: vi.fn(),
    deferUpdate: vi.fn(),
    editReply: vi.fn(),
  };
}

describe("interaction handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAllowedPrincipal.mockReturnValue(true);
    mocks.getConfig.mockReturnValue({
      DISCORD_QUEUE_MAX_ITEMS: 10,
      DISCORD_ENABLE_AUTO_APPROVE: true,
      DISCORD_ENABLE_SESSION_DELETE: true,
    });
    mocks.sessionManager.stopSession.mockResolvedValue(true);
    mocks.sessionManager.confirmQueue.mockReturnValue(true);
    mocks.sessionManager.getQueueSize.mockReturnValue(3);
    mocks.sessionManager.resolveApproval.mockReturnValue(true);
    mocks.sessionManager.resolveQuestion.mockReturnValue(true);
    mocks.getProject.mockReturnValue({
      channel_id: "legacy-channel",
      project_path: "/projects/app",
      guild_id: "guild-id",
      auto_approve: 0,
      created_at: "now",
    });
    mocks.getAllProjects.mockReturnValue([
      {
        channel_id: "current-channel",
        project_path: "/projects/app",
        guild_id: "guild-id",
        auto_approve: 0,
        created_at: "now",
      },
    ]);
    mocks.readThread.mockResolvedValue({
      turns: [
        {
          items: [
            { type: "agentMessage", text: "Last answer" },
          ],
        },
      ],
    });
  });

  it("rejects unauthorized button interactions", async () => {
    mocks.isAllowedPrincipal.mockReturnValue(false);
    const interaction = makeButton("stop:channel-1");

    await handleButtonInteraction(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: "You are not authorized.",
      ephemeral: true,
    });
    expect(mocks.sessionManager.stopSession).not.toHaveBeenCalled();
  });

  it("stops the active channel session", async () => {
    const interaction = makeButton("stop:channel-1");

    await handleButtonInteraction(interaction as never);

    expect(mocks.sessionManager.stopSession).toHaveBeenCalledWith("channel-1");
    expect(interaction.update).toHaveBeenCalledWith({
      content: "⏹️ Task has been stopped.",
      components: [],
    });
  });

  it("confirms queued prompts with configured queue size", async () => {
    const interaction = makeButton("queue-yes:channel-1");

    await handleButtonInteraction(interaction as never);

    expect(mocks.sessionManager.confirmQueue).toHaveBeenCalledWith("channel-1");
    expect(interaction.update).toHaveBeenCalledWith({
      content: "📨 Message added to queue (3/10). It will be processed after the current task.",
      components: [],
    });
  });

  it("resolves approval buttons", async () => {
    const interaction = makeButton("approve:req-1");

    await handleButtonInteraction(interaction as never);

    expect(mocks.sessionManager.resolveApproval).toHaveBeenCalledWith("req-1", "approve");
    expect(interaction.update).toHaveBeenCalledWith({
      content: "✅ Approved",
      components: [],
    });
  });

  it("does not claim auto-approve was enabled when disabled in config", async () => {
    mocks.getConfig.mockReturnValue({
      DISCORD_QUEUE_MAX_ITEMS: 10,
      DISCORD_ENABLE_AUTO_APPROVE: false,
      DISCORD_ENABLE_SESSION_DELETE: true,
    });
    const interaction = makeButton("approve-all:req-1");

    await handleButtonInteraction(interaction as never);

    expect(mocks.sessionManager.resolveApproval).toHaveBeenCalledWith("req-1", "approve-all");
    expect(interaction.update).toHaveBeenCalledWith({
      content: "✅ Approved for this request. Auto-approve is disabled in config.",
      components: [],
    });
  });

  it("selects a new session from the session select menu", async () => {
    const interaction = makeSelect("session-select", ["__new_session__"]);

    await handleSelectMenuInteraction(interaction as never);

    expect(mocks.upsertSession).toHaveBeenCalledWith(expect.any(String), "channel-1", null, "idle");
    expect(interaction.update).toHaveBeenCalledWith(expect.objectContaining({
      components: [],
    }));
  });

  it("shows selected session details and disables delete when deletion is not enabled", async () => {
    mocks.getConfig.mockReturnValue({
      DISCORD_QUEUE_MAX_ITEMS: 10,
      DISCORD_ENABLE_AUTO_APPROVE: true,
      DISCORD_ENABLE_SESSION_DELETE: false,
    });
    const interaction = makeSelect("session-select", ["thread-1"]);

    await handleSelectMenuInteraction(interaction as never);

    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(mocks.readThread).toHaveBeenCalledWith("thread-1", true);
    const payload = interaction.editReply.mock.calls[0][0];
    expect(payload.embeds[0].description).toContain("Last response");
    expect(payload.components[0].components[1].data.disabled).toBe(true);
  });

  it("reports selected session read failures without throwing", async () => {
    mocks.readThread.mockRejectedValue(new Error("missing thread"));
    const interaction = makeSelect("session-select", ["thread-1"]);

    await handleSelectMenuInteraction(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Failed to read selected Codex session: missing thread",
      embeds: [],
      components: [],
    });
  });

  it("rejects session delete when disabled in config", async () => {
    mocks.getConfig.mockReturnValue({
      DISCORD_QUEUE_MAX_ITEMS: 10,
      DISCORD_ENABLE_AUTO_APPROVE: true,
      DISCORD_ENABLE_SESSION_DELETE: false,
    });
    const interaction = makeButton("session-delete:thread-1");

    await handleButtonInteraction(interaction as never);

    expect(mocks.deleteStoredThread).not.toHaveBeenCalled();
    expect(interaction.update).toHaveBeenCalledWith({
      content: "`session-delete` is disabled. Set `DISCORD_ENABLE_SESSION_DELETE=true` in `.env` to enable it.",
      embeds: [],
      components: [],
    });
  });

  it("deletes a selected session when explicitly enabled", async () => {
    mocks.deleteStoredThread.mockReturnValue(true);
    const interaction = makeButton("session-delete:thread-1");

    await handleButtonInteraction(interaction as never);

    expect(mocks.deleteStoredThread).toHaveBeenCalledWith("thread-1");
    expect(interaction.update).toHaveBeenCalledWith(expect.objectContaining({
      components: [],
    }));
  });

  it("resolves ask select menu choices by label", async () => {
    const interaction = makeSelect("ask-select:req-1", ["value-a"]);

    await handleSelectMenuInteraction(interaction as never);

    expect(mocks.sessionManager.resolveQuestion).toHaveBeenCalledWith("req-1", "Option A");
    expect(interaction.update).toHaveBeenCalledWith({
      content: "✅ Selected: **Option A**",
      embeds: [],
      components: [],
    });
  });

  it("removes a selected project-channel mapping from mappings buttons", async () => {
    const interaction = {
      ...makeButton("mapping-remove:legacy-channel"),
      guildId: "guild-id",
    };

    await handleButtonInteraction(interaction as never);

    expect(mocks.sessionManager.stopSession).toHaveBeenCalledWith("legacy-channel");
    expect(mocks.unregisterProject).toHaveBeenCalledWith("legacy-channel");
    expect(interaction.update).toHaveBeenCalledWith(expect.objectContaining({
      content: "Removed mapping for <#legacy-channel>.",
      embeds: expect.any(Array),
      components: expect.any(Array),
    }));
  });

  it("reports a mapping button that was already removed", async () => {
    mocks.getProject.mockReturnValue(undefined);
    const interaction = {
      ...makeButton("mapping-remove:legacy-channel"),
      guildId: "guild-id",
    };

    await handleButtonInteraction(interaction as never);

    expect(mocks.unregisterProject).not.toHaveBeenCalled();
    expect(interaction.update).toHaveBeenCalledWith(expect.objectContaining({
      content: "This mapping is already removed.",
      embeds: expect.any(Array),
    }));
  });
});
