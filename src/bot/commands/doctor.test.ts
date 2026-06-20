import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  getProject: vi.fn(),
  getProjectsByPath: vi.fn(),
  resolveCodexCommand: vi.fn(),
  getConfig: vi.fn(),
  runLocalCommand: vi.fn(),
  expectedCommandNames: vi.fn(),
  inspectDiscordCommandRegistration: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: mocks.existsSync,
  },
}));

vi.mock("../../db/database.js", () => ({
  getProject: mocks.getProject,
  getProjectsByPath: mocks.getProjectsByPath,
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

vi.mock("../command-surface.js", () => ({
  expectedCommandNames: mocks.expectedCommandNames,
  inspectDiscordCommandRegistration: mocks.inspectDiscordCommandRegistration,
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
    mocks.getProject.mockReturnValue({ channel_id: "channel-1", project_path: "/projects/app", guild_id: "guild-id" });
    mocks.getProjectsByPath.mockReturnValue([{ channel_id: "channel-1", project_path: "/projects/app", guild_id: "guild-id" }]);
    mocks.resolveCodexCommand.mockReturnValue("codex.cmd");
    mocks.getConfig.mockReturnValue({
      DISCORD_APPLICATION_ID: "app-id",
      DISCORD_GUILD_ID: "guild-id",
      DISCORD_NOTIFICATION_CHANNEL_ID: "",
      ALLOWED_USER_IDS: ["user-id"],
      ALLOWED_ROLE_IDS: [],
      BASE_PROJECT_DIR: "/projects",
      DISCORD_ENABLE_MESSAGE_PROMPTS: false,
      DISCORD_ENABLE_ATTACHMENT_MESSAGES: false,
      DISCORD_REGISTER_COMMANDS: true,
    });
    mocks.expectedCommandNames.mockReturnValue(["ask", "doctor", "status"]);
    mocks.inspectDiscordCommandRegistration.mockResolvedValue([
      "OK application command registration 3/3",
    ]);
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
    expect(content).toContain("INFO notification channel not configured");
    expect(content).toContain("OK allowed principals configured");
    expect(content).toContain("OK known application command surface 3 commands");
    expect(content).toContain("INFO startup application command registration enabled");
    expect(content).toContain("OK application command registration 3/3");
    expect(content).toContain("INFO message prompts disabled; slash commands work without Message Content intent");
    expect(content).toContain("INFO attachment messages disabled; use /ask file fields or Send to Codex");
    expect(content).toContain("OK this channel is registered");
    expect(content).toContain("OK project has one channel mapping");
    expect(content).toContain("OK codex login status");
    expect(content).not.toContain("app-id");
    expect(content).not.toContain("guild-id");
    expect(content).not.toContain("user-id");
  });

  it("reports missing registration and failed Codex login status", async () => {
    mocks.getProject.mockReturnValue(undefined);
    mocks.getProjectsByPath.mockReturnValue([]);
    mocks.runLocalCommand
      .mockResolvedValueOnce({ exitCode: 0, timedOut: false, output: "version" })
      .mockResolvedValueOnce({ exitCode: 1, timedOut: false, output: "not logged in" });
    const interaction = makeInteraction();

    await execute(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("FAIL channel registration: run /register first");
    expect(content).not.toContain("project has one channel mapping");
    expect(content).toContain("FAIL codex login status: not logged in or command failed");
  });

  it("reports duplicate channel mappings for the same project", async () => {
    mocks.getProjectsByPath.mockReturnValue([
      { channel_id: "channel-1", project_path: "/projects/app", guild_id: "guild-id" },
      { channel_id: "channel-2", project_path: "/projects/app", guild_id: "guild-id" },
      { channel_id: "channel-3", project_path: "/projects/app", guild_id: "guild-id" },
    ]);
    const interaction = makeInteraction();

    await execute(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("INFO project has 3 channel mappings; old forum/thread mappings may still exist");
  });

  it("reports when message prompt mode needs the privileged Discord intent", async () => {
    mocks.getConfig.mockReturnValue({
      DISCORD_APPLICATION_ID: "app-id",
      DISCORD_GUILD_ID: "guild-id",
      DISCORD_NOTIFICATION_CHANNEL_ID: "notify-channel",
      ALLOWED_USER_IDS: ["user-id"],
      ALLOWED_ROLE_IDS: [],
      BASE_PROJECT_DIR: "/projects",
      DISCORD_ENABLE_MESSAGE_PROMPTS: true,
      DISCORD_ENABLE_ATTACHMENT_MESSAGES: true,
      DISCORD_REGISTER_COMMANDS: false,
    });
    const interaction = makeInteraction();

    await execute(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("OK notification channel configured");
    expect(content).toContain("INFO startup application command registration disabled");
    expect(content).toContain("INFO message prompts enabled; Discord Message Content intent must be enabled in Developer Portal");
    expect(content).toContain("INFO attachment messages enabled; normal Discord file messages require Message Content intent and a written instruction");
  });
});
