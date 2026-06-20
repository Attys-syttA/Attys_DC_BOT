import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  upsertSession: vi.fn(),
  updateSessionStatus: vi.fn(),
  getProject: vi.fn(),
  getSession: vi.fn(),
  setAutoApprove: vi.fn(),
  getConfig: vi.fn(),
  codexAppServer: {
    ensureStarted: vi.fn(),
    on: vi.fn(),
    startThread: vi.fn(),
    resumeThread: vi.fn(),
    startTurn: vi.fn(),
    respond: vi.fn(),
    interruptTurn: vi.fn(),
  },
  sendOperatorAttentionNotification: vi.fn(),
  sendOperatorTaskOutcomeNotification: vi.fn(),
}));

vi.mock("../db/database.js", () => ({
  upsertSession: mocks.upsertSession,
  updateSessionStatus: mocks.updateSessionStatus,
  getProject: mocks.getProject,
  getSession: mocks.getSession,
  setAutoApprove: mocks.setAutoApprove,
}));

vi.mock("../utils/config.js", () => ({
  getConfig: mocks.getConfig,
}));

vi.mock("../utils/i18n.js", () => ({
  L: (en: string, _kr: string) => en,
}));

vi.mock("./app-server-client.js", () => ({
  codexAppServer: mocks.codexAppServer,
}));

vi.mock("../bot/notifications.js", () => ({
  sendOperatorAttentionNotification: mocks.sendOperatorAttentionNotification,
  sendOperatorTaskOutcomeNotification: mocks.sendOperatorTaskOutcomeNotification,
}));

import { SessionManager } from "./session-manager.js";
import { createStopButton, splitMessage } from "./output-formatter.js";

function createFakeMessage() {
  return {
    edit: vi.fn().mockResolvedValue(undefined),
  };
}

describe("SessionManager streaming output", () => {
  let now = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    mocks.getConfig.mockReturnValue({
      SHOW_COST: false,
      DISCORD_ENABLE_AUTO_APPROVE: false,
      DISCORD_QUEUE_MAX_ITEMS: 10,
    });
    mocks.sendOperatorAttentionNotification.mockResolvedValue(undefined);
    mocks.sendOperatorTaskOutcomeNotification.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accumulates agent deltas instead of replacing earlier text", async () => {
    const manager = new SessionManager();
    const firstMessage = createFakeMessage();
    const channel = {
      id: "channel-1",
      send: vi.fn(),
    } as any;

    (manager as any).sessions.set("channel-1", {
      channelId: "channel-1",
      channel,
      threadId: "thread-1",
      turnId: "turn-1",
      dbId: "db-1",
    });

    (manager as any).streamState.set("channel-1", {
      buffer: "",
      messages: [firstMessage],
      lastEditTime: 0,
      stopRow: createStopButton("channel-1"),
      startedAt: 0,
      lastActivity: "Thinking...",
      toolUseCount: 0,
      heartbeat: setInterval(() => {}, 60_000),
      hasTextOutput: false,
      lastError: null,
    });

    now = 2_000;
    await (manager as any).handleNotification({
      method: "item/agentMessage/delta",
      params: { threadId: "thread-1", delta: "저는 " },
    });

    now = 4_000;
    await (manager as any).handleNotification({
      method: "item/agentMessage/delta",
      params: { threadId: "thread-1", delta: "Codex입니다." },
    });

    expect(firstMessage.edit).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: "저는 Codex입니다." }),
    );
    expect(channel.send).not.toHaveBeenCalled();

    clearInterval((manager as any).streamState.get("channel-1").heartbeat);
  });

  it("keeps earlier chunks and sends only newly needed Discord messages", async () => {
    const manager = new SessionManager();
    const firstMessage = createFakeMessage();
    const sentMessages: Array<ReturnType<typeof createFakeMessage>> = [];
    const channel = {
      id: "channel-2",
      send: vi.fn().mockImplementation(async () => {
        const message = createFakeMessage();
        sentMessages.push(message);
        return message;
      }),
    } as any;

    (manager as any).sessions.set("channel-2", {
      channelId: "channel-2",
      channel,
      threadId: "thread-2",
      turnId: "turn-2",
      dbId: "db-2",
    });

    (manager as any).streamState.set("channel-2", {
      buffer: "",
      messages: [firstMessage],
      lastEditTime: 0,
      stopRow: createStopButton("channel-2"),
      startedAt: 0,
      lastActivity: "Thinking...",
      toolUseCount: 0,
      heartbeat: setInterval(() => {}, 60_000),
      hasTextOutput: false,
      lastError: null,
    });

    const firstDelta = "a".repeat(1890);
    const secondDelta = "\n" + "b".repeat(80);

    now = 2_000;
    await (manager as any).handleNotification({
      method: "item/agentMessage/delta",
      params: { threadId: "thread-2", delta: firstDelta },
    });

    now = 4_000;
    await (manager as any).handleNotification({
      method: "item/agentMessage/delta",
      params: { threadId: "thread-2", delta: secondDelta },
    });

    const chunks = splitMessage(firstDelta + secondDelta);
    expect(chunks).toHaveLength(2);
    expect(firstMessage.edit).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: chunks[0] }),
    );
    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(sentMessages[0].edit).not.toHaveBeenCalled();

    clearInterval((manager as any).streamState.get("channel-2").heartbeat);
  });

  it("sends a central task-completed notification when a turn completes", async () => {
    const manager = new SessionManager();
    const firstMessage = createFakeMessage();
    const channel = {
      id: "channel-3",
      send: vi.fn().mockResolvedValue(createFakeMessage()),
    } as any;

    (manager as any).sessions.set("channel-3", {
      channelId: "channel-3",
      channel,
      threadId: "thread-3",
      turnId: "turn-3",
      dbId: "db-3",
    });

    (manager as any).streamState.set("channel-3", {
      buffer: "Done",
      messages: [firstMessage],
      lastEditTime: 0,
      stopRow: createStopButton("channel-3"),
      startedAt: 0,
      lastActivity: "Thinking...",
      toolUseCount: 0,
      heartbeat: setInterval(() => {}, 60_000),
      hasTextOutput: true,
      lastError: null,
    });

    now = 5_000;
    await (manager as any).handleNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-3",
        turn: { status: "completed" },
      },
    });

    expect(mocks.sendOperatorTaskOutcomeNotification).toHaveBeenCalledWith(
      channel,
      expect.any(Object),
      "completed",
    );
    expect(mocks.updateSessionStatus).toHaveBeenCalledWith("channel-3", "idle");
  });

  it("sends a central task-failed notification when a turn fails", async () => {
    const manager = new SessionManager();
    const firstMessage = createFakeMessage();
    const channel = {
      id: "channel-4",
      send: vi.fn().mockResolvedValue(createFakeMessage()),
    } as any;

    (manager as any).sessions.set("channel-4", {
      channelId: "channel-4",
      channel,
      threadId: "thread-4",
      turnId: "turn-4",
      dbId: "db-4",
    });

    (manager as any).streamState.set("channel-4", {
      buffer: "",
      messages: [firstMessage],
      lastEditTime: 0,
      stopRow: createStopButton("channel-4"),
      startedAt: 0,
      lastActivity: "Thinking...",
      toolUseCount: 0,
      heartbeat: setInterval(() => {}, 60_000),
      hasTextOutput: false,
      lastError: null,
    });

    await (manager as any).handleNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-4",
        turn: {
          status: "failed",
          error: { message: "private failure details C:\\Users\\someone\\repo DISCORD_BOT_TOKEN=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" },
        },
      },
    });

    expect(firstMessage.edit).toHaveBeenCalledWith({
      content: expect.not.stringContaining("someone"),
      components: [],
    });
    expect(firstMessage.edit).toHaveBeenCalledWith({
      content: expect.stringContaining("DISCORD_BOT_TOKEN=<redacted>"),
      components: [],
    });
    expect(mocks.sendOperatorTaskOutcomeNotification).toHaveBeenCalledWith(
      channel,
      expect.any(Object),
      "failed",
    );
    expect(mocks.updateSessionStatus).toHaveBeenCalledWith("channel-4", "offline");
  });
});

describe("SessionManager approval safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockReturnValue({
      SHOW_COST: false,
      DISCORD_ENABLE_AUTO_APPROVE: false,
      DISCORD_QUEUE_MAX_ITEMS: 10,
    });
    mocks.sendOperatorAttentionNotification.mockResolvedValue(undefined);
    mocks.sendOperatorTaskOutcomeNotification.mockResolvedValue(undefined);
  });

  it("treats approve-all as a single approval when auto-approve is disabled", async () => {
    const manager = new SessionManager();
    const channel = {
      send: vi.fn().mockResolvedValue({}),
    } as any;

    const approval = (manager as any).requestApproval(
      channel,
      "channel-1",
      44,
      "execCommand",
      {},
    );
    await vi.waitFor(() => {
      expect(channel.send).toHaveBeenCalled();
    });
    expect(mocks.sendOperatorAttentionNotification).toHaveBeenCalledWith(
      channel,
      expect.any(Object),
      "approval",
    );
    await vi.waitFor(() => {
      expect(manager.getOperatorRuntimeSnapshot("channel-1")).toMatchObject({
        pendingApproval: true,
      });
    });
    const resolved = manager.resolveApproval("44", "approve-all");

    await expect(approval).resolves.toBe("accept");
    expect(resolved).toBe(true);
    expect(mocks.setAutoApprove).not.toHaveBeenCalled();
  });

  it("persists approve-all only when auto-approve is explicitly enabled", async () => {
    mocks.getConfig.mockReturnValue({
      SHOW_COST: false,
      DISCORD_ENABLE_AUTO_APPROVE: true,
      DISCORD_QUEUE_MAX_ITEMS: 10,
    });
    const manager = new SessionManager();
    const channel = {
      send: vi.fn().mockResolvedValue({}),
    } as any;

    const approval = (manager as any).requestApproval(
      channel,
      "channel-1",
      45,
      "execCommand",
      {},
    );
    await vi.waitFor(() => {
      expect(channel.send).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      expect(manager.getOperatorRuntimeSnapshot("channel-1")).toMatchObject({
        pendingApproval: true,
      });
    });
    const resolved = manager.resolveApproval("45", "approve-all");

    await expect(approval).resolves.toBe("acceptForSession");
    expect(resolved).toBe(true);
    expect(mocks.setAutoApprove).toHaveBeenCalledWith("channel-1", true);
  });

  it("does not auto-accept stored auto-approve when config disables it", async () => {
    const manager = new SessionManager();
    const channel = {
      send: vi.fn().mockResolvedValue({}),
    } as any;
    (manager as any).sessions.set("channel-1", {
      channelId: "channel-1",
      channel,
      threadId: "thread-1",
      turnId: "turn-1",
      dbId: "db-1",
    });
    mocks.getProject.mockReturnValue({
      channel_id: "channel-1",
      project_path: "/projects/app",
      auto_approve: 1,
    });

    const response = (manager as any).handleServerRequest({
      id: 46,
      method: "execCommand",
      params: { threadId: "thread-1" },
    });

    await vi.waitFor(() => {
      expect(channel.send).toHaveBeenCalled();
    });
    expect(mocks.codexAppServer.respond).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(manager.getOperatorRuntimeSnapshot("channel-1")).toMatchObject({
        pendingApproval: true,
      });
    });

    manager.resolveApproval("46", "approve");
    await response;

    expect(mocks.codexAppServer.respond).toHaveBeenCalledWith(46, { decision: "accept" });
  });
});

describe("SessionManager user input routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockReturnValue({
      SHOW_COST: false,
      DISCORD_ENABLE_AUTO_APPROVE: false,
      DISCORD_QUEUE_MAX_ITEMS: 10,
    });
    mocks.sendOperatorAttentionNotification.mockResolvedValue(undefined);
    mocks.sendOperatorTaskOutcomeNotification.mockResolvedValue(undefined);
  });

  it("routes custom typed answers back to the active Codex question id", async () => {
    const manager = new SessionManager();
    const channel = {
      send: vi.fn().mockResolvedValue({}),
    } as any;

    const answerPromise = (manager as any).askUserInput(
      channel,
      "channel-1",
      77,
      [
        {
          id: "question-project-choice",
          header: "Project",
          question: "Which project should I use?",
          options: [{ label: "Current", description: "Use current project" }],
        },
      ],
    );

    await vi.waitFor(() => {
      expect(channel.send).toHaveBeenCalled();
    });
    expect(mocks.sendOperatorAttentionNotification).toHaveBeenCalledWith(
      channel,
      expect.any(Object),
      "question",
    );

    await vi.waitFor(() => {
      expect(manager.getOperatorRuntimeSnapshot("channel-1")).toMatchObject({
        pendingQuestion: true,
      });
    });

    manager.enableCustomInput("77", "channel-1");
    expect(manager.getOperatorRuntimeSnapshot("channel-1")).toMatchObject({
      pendingQuestion: true,
      pendingCustomInput: true,
    });

    const resolved = manager.resolveCustomInput("channel-1", "Use the active repo");

    await expect(answerPromise).resolves.toEqual({
      "question-project-choice": { answers: ["Use the active repo"] },
    });
    expect(resolved).toBe(true);
    expect(manager.getOperatorRuntimeSnapshot("channel-1")).toMatchObject({
      pendingQuestion: false,
      pendingCustomInput: false,
    });
  });
});
