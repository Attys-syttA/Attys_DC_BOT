import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getProject: vi.fn(),
  setAutoApprove: vi.fn(),
}));

vi.mock("../../utils/config.js", () => ({
  getConfig: mocks.getConfig,
}));

vi.mock("../../db/database.js", () => ({
  getProject: mocks.getProject,
  setAutoApprove: mocks.setAutoApprove,
}));

import { execute } from "./auto-approve.js";

function makeInteraction(mode: "on" | "off") {
  return {
    channelId: "channel-1",
    options: {
      getString: vi.fn().mockReturnValue(mode),
    },
    editReply: vi.fn(),
  };
}

describe("/auto-approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_AUTO_APPROVE: true });
    mocks.getProject.mockReturnValue({
      channel_id: "channel-1",
      project_path: "/projects/app",
      auto_approve: 0,
    });
  });

  it("rejects enabling auto-approve unless explicitly enabled in config", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_AUTO_APPROVE: false });
    const interaction = makeInteraction("on");

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "`auto-approve` is disabled. Set `DISCORD_ENABLE_AUTO_APPROVE=true` in `.env` to enable it.",
    });
    expect(mocks.setAutoApprove).not.toHaveBeenCalled();
  });

  it("allows disabling auto-approve even when config disables the feature", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_AUTO_APPROVE: false });
    const interaction = makeInteraction("off");

    await execute(interaction as never);

    expect(mocks.setAutoApprove).toHaveBeenCalledWith("channel-1", false);
    const payload = interaction.editReply.mock.calls[0][0];
    expect(payload.embeds[0].title).toBe("Auto-approve: OFF");
  });

  it("enables auto-approve when config explicitly allows it", async () => {
    const interaction = makeInteraction("on");

    await execute(interaction as never);

    expect(mocks.setAutoApprove).toHaveBeenCalledWith("channel-1", true);
    const payload = interaction.editReply.mock.calls[0][0];
    expect(payload.embeds[0].title).toBe("Auto-approve: ON");
  });
});
