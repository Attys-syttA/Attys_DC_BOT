import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getProject: vi.fn(),
  isAllowedPrincipal: vi.fn(),
  checkRateLimit: vi.fn(),
  sessionManager: {
    hasPendingCustomInput: vi.fn(),
    resolveCustomInput: vi.fn(),
    isActive: vi.fn(),
    hasQueue: vi.fn(),
    isQueueFull: vi.fn(),
    setPendingQueue: vi.fn(),
    sendMessage: vi.fn(),
  },
}));

vi.mock("../../utils/config.js", () => ({
  getConfig: mocks.getConfig,
}));

vi.mock("../../db/database.js", () => ({
  getProject: mocks.getProject,
}));

vi.mock("../../security/guard.js", () => ({
  isAllowedPrincipal: mocks.isAllowedPrincipal,
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("../../codex/session-manager.js", () => ({
  sessionManager: mocks.sessionManager,
}));

import { handleMessage, safeAttachmentFileName } from "./message.js";

function makeMessage(content: string) {
  return {
    author: { bot: false, id: "user-1" },
    guild: { id: "guild-1" },
    channelId: "channel-1",
    channel: { id: "channel-1" },
    content,
    attachments: new Map(),
    member: { roles: { cache: new Map([["role-1", true]]) } },
    reply: vi.fn(),
    react: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfig.mockReturnValue({
    DISCORD_ENABLE_MESSAGE_PROMPTS: false,
    DISCORD_QUEUE_MAX_ITEMS: 10,
  });
  mocks.getProject.mockReturnValue({
    channel_id: "channel-1",
    project_path: "/projects/app",
  });
  mocks.isAllowedPrincipal.mockReturnValue(true);
  mocks.checkRateLimit.mockReturnValue(true);
  mocks.sessionManager.hasPendingCustomInput.mockReturnValue(false);
  mocks.sessionManager.isActive.mockReturnValue(false);
});

describe("safeAttachmentFileName", () => {
  it("keeps a simple filename", () => {
    expect(safeAttachmentFileName("notes.txt")).toBe("notes.txt");
  });

  it("strips path traversal and unsafe characters", () => {
    expect(safeAttachmentFileName("..\\..\\secret?.txt")).toBe("secret_.txt");
    expect(safeAttachmentFileName("../../secret?.txt")).toBe("secret_.txt");
  });

  it("uses a safe fallback for empty names", () => {
    expect(safeAttachmentFileName("...")).toBe("attachment");
    expect(safeAttachmentFileName(null)).toBe("attachment");
  });
});

describe("handleMessage custom input", () => {
  it("accepts pending custom input even when message prompts are disabled", async () => {
    mocks.sessionManager.hasPendingCustomInput.mockReturnValue(true);
    mocks.sessionManager.resolveCustomInput.mockReturnValue(true);
    const message = makeMessage("Use the active repo");

    await handleMessage(message as never);

    expect(mocks.sessionManager.resolveCustomInput).toHaveBeenCalledWith("channel-1", "Use the active repo");
    expect(message.react).toHaveBeenCalledWith("✅");
    expect(mocks.sessionManager.sendMessage).not.toHaveBeenCalled();
  });

  it("ignores normal message prompts when message prompts are disabled", async () => {
    const message = makeMessage("Run a normal task");

    await handleMessage(message as never);

    expect(mocks.sessionManager.resolveCustomInput).not.toHaveBeenCalled();
    expect(mocks.sessionManager.sendMessage).not.toHaveBeenCalled();
  });
});
