import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  getSession: vi.fn(),
  isActive: vi.fn(),
  getQueueSize: vi.fn(),
  getOperatorRuntimeSnapshot: vi.fn(),
  resolveCodexCommand: vi.fn(),
  readOperatorEvents: vi.fn(),
  describeOperatorEventLine: vi.fn(),
}));

vi.mock("../../db/database.js", () => ({
  getProject: mocks.getProject,
  getSession: mocks.getSession,
}));

vi.mock("../../codex/session-manager.js", () => ({
  sessionManager: {
    isActive: mocks.isActive,
    getQueueSize: mocks.getQueueSize,
    getOperatorRuntimeSnapshot: mocks.getOperatorRuntimeSnapshot,
  },
}));

vi.mock("../../codex/command-resolver.js", () => ({
  resolveCodexCommand: mocks.resolveCodexCommand,
}));

vi.mock("../operator-events.js", () => ({
  readOperatorEvents: mocks.readOperatorEvents,
  describeOperatorEventLine: mocks.describeOperatorEventLine,
}));

import { execute } from "./dashboard.js";

function makeInteraction() {
  return {
    channelId: "channel-1",
    editReply: vi.fn(),
  };
}

describe("/dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCodexCommand.mockReturnValue("codex.cmd");
    mocks.isActive.mockReturnValue(false);
    mocks.getQueueSize.mockReturnValue(0);
    mocks.getOperatorRuntimeSnapshot.mockReturnValue({
      active: false,
      pendingApproval: false,
      pendingQuestion: false,
      pendingCustomInput: false,
      pendingQueuePrompt: false,
      queueSize: 0,
    });
    mocks.readOperatorEvents.mockReturnValue([]);
    mocks.describeOperatorEventLine.mockImplementation((line: string) => line.replace(/^timestamp /, ""));
  });

  it("prompts unregistered channels to register first", async () => {
    mocks.getProject.mockReturnValue(undefined);
    const interaction = makeInteraction();

    await execute(interaction as never);

    const payload = interaction.editReply.mock.calls[0][0];
    expect(payload.embeds[0].data.title).toBe("Local Codex Dashboard");
    expect(payload.embeds[0].data.description).toContain("/register");
  });

  it("shows safe project, session, and control state for registered channels", async () => {
    mocks.getProject.mockReturnValue({
      channel_id: "channel-1",
      project_path: "/projects/app",
      auto_approve: 0,
    });
    mocks.getSession.mockReturnValue({
      session_id: "abcdefgh12345678",
      status: "idle",
      last_activity: "2026-06-17 20:00:00",
    });
    mocks.getQueueSize.mockReturnValue(2);
    const interaction = makeInteraction();

    await execute(interaction as never);

    const payload = interaction.editReply.mock.calls[0][0];
    const fields = payload.embeds[0].data.fields;
    expect(fields[0].value).toBe("`<local-path>/app`");
    expect(fields[1].value).toContain("**idle**");
    expect(fields[1].value).toContain("`abcdefgh...`");
    expect(fields[2].value).toContain("Queue: **2**");
    expect(fields[2].value).toContain("Pending operator action: **none**");
    expect(fields[2].value).toContain("`codex.cmd`");
    expect(fields[3].name).toBe("Recent operator events");
    expect(fields[3].value).toBe("none");
    expect(payload.components).toHaveLength(1);
  });

  it("shows recent public-safe operator events newest first", async () => {
    mocks.getProject.mockReturnValue({
      channel_id: "channel-1",
      project_path: "/projects/app",
      auto_approve: 0,
    });
    mocks.getSession.mockReturnValue(undefined);
    mocks.readOperatorEvents.mockReturnValue([
      "timestamp lifecycle session-new",
      "timestamp task completed",
    ]);
    const interaction = makeInteraction();

    await execute(interaction as never);

    const payload = interaction.editReply.mock.calls[0][0];
    const fields = payload.embeds[0].data.fields;
    expect(fields[3].value).toBe("- task completed\n- lifecycle session-new");
  });

  it("shows pending Codex user-input state", async () => {
    mocks.getProject.mockReturnValue({
      channel_id: "channel-1",
      project_path: "/projects/app",
      auto_approve: 0,
    });
    mocks.getSession.mockReturnValue(undefined);
    mocks.getOperatorRuntimeSnapshot.mockReturnValue({
      active: true,
      pendingApproval: false,
      pendingQuestion: true,
      pendingCustomInput: true,
      pendingQueuePrompt: false,
      queueSize: 0,
    });
    const interaction = makeInteraction();

    await execute(interaction as never);

    const payload = interaction.editReply.mock.calls[0][0];
    const fields = payload.embeds[0].data.fields;
    expect(fields[2].value).toContain("Pending operator action: **custom answer**");
  });
});
