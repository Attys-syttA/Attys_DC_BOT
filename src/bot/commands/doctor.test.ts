import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  getProject: vi.fn(),
  resolveCodexCommand: vi.fn(),
  getConfig: vi.fn(),
  runLocalCommand: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: mocks.existsSync,
  },
}));

vi.mock("../../db/database.js", () => ({
  getProject: mocks.getProject,
}));

vi.mock("../../codex/command-resolver.js", () => ({
  resolveCodexCommand: mocks.resolveCodexCommand,
}));

vi.mock("../../utils/config.js", () => ({
  getConfig: mocks.getConfig,
}));

vi.mock("./local-command.js", () => ({
  runLocalCommand: mocks.runLocalCommand,
}));

import { execute } from "./doctor.js";

function makeInteraction() {
  return {
    channelId: "channel-1",
    editReply: vi.fn(),
  };
}

describe("/doctor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existsSync.mockReturnValue(true);
    mocks.getProject.mockReturnValue({ channel_id: "channel-1", project_path: "/projects/app" });
    mocks.resolveCodexCommand.mockReturnValue("codex.cmd");
    mocks.getConfig.mockReturnValue({
      DISCORD_APPLICATION_ID: "app-id",
      DISCORD_GUILD_ID: "guild-id",
      ALLOWED_USER_IDS: ["user-id"],
      ALLOWED_ROLE_IDS: [],
      BASE_PROJECT_DIR: "/projects",
    });
    mocks.runLocalCommand.mockResolvedValue({
      exitCode: 0,
      timedOut: false,
      output: "ok",
    });
  });

  it("reports local readiness without printing secret values", async () => {
    const interaction = makeInteraction();

    await execute(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("OK DISCORD_APPLICATION_ID configured");
    expect(content).toContain("OK allowed principals configured");
    expect(content).toContain("OK this channel is registered");
    expect(content).toContain("OK codex login status");
    expect(content).not.toContain("app-id");
    expect(content).not.toContain("guild-id");
    expect(content).not.toContain("user-id");
  });

  it("reports missing registration and failed Codex login status", async () => {
    mocks.getProject.mockReturnValue(undefined);
    mocks.runLocalCommand
      .mockResolvedValueOnce({ exitCode: 0, timedOut: false, output: "version" })
      .mockResolvedValueOnce({ exitCode: 1, timedOut: false, output: "not logged in" });
    const interaction = makeInteraction();

    await execute(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("FAIL channel registration: run /register first");
    expect(content).toContain("FAIL codex login status: not logged in or command failed");
  });
});
