import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getProject: vi.fn(),
  runLocalCommand: vi.fn(),
}));

vi.mock("../../utils/config.js", () => ({
  getConfig: mocks.getConfig,
}));

vi.mock("../../db/database.js", () => ({
  getProject: mocks.getProject,
}));

vi.mock("./local-command.js", () => ({
  npmCommand: () => "npm.cmd",
  runLocalCommand: mocks.runLocalCommand,
  truncateOutput: (output: string) => output.trim() || "(no output)",
}));

import { execute } from "./run-tests.js";

function makeInteraction() {
  return {
    channelId: "channel-1",
    editReply: vi.fn(),
    followUp: vi.fn(),
  };
}

describe("/run-tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_RUN_TESTS: true });
    mocks.getProject.mockReturnValue({ channel_id: "channel-1", project_path: "/projects/app" });
    mocks.runLocalCommand.mockResolvedValue({
      exitCode: 0,
      timedOut: false,
      output: "tests passed\n",
    });
  });

  it("is disabled unless explicitly enabled in config", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_RUN_TESTS: false });
    const interaction = makeInteraction();

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "`/run-tests` is disabled. Set `DISCORD_ENABLE_RUN_TESTS=true` in `.env` to enable it.",
    });
    expect(mocks.runLocalCommand).not.toHaveBeenCalled();
  });

  it("runs npm test in the registered project when enabled", async () => {
    const interaction = makeInteraction();

    await execute(interaction as never);

    expect(mocks.runLocalCommand).toHaveBeenCalledWith("npm.cmd", ["test"], "/projects/app", 120_000);
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: "**npm test passed**\n```text\ntests passed\n```",
    });
  });
});
