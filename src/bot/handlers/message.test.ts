import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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

function makeMessage(content: string, attachments: unknown[] = []) {
  return {
    author: { bot: false, id: "user-1" },
    guild: { id: "guild-1" },
    channelId: "channel-1",
    channel: { id: "channel-1" },
    content,
    attachments: new Map(attachments.map((attachment, index) => [`a-${index}`, attachment])),
    member: { roles: { cache: new Map([["role-1", true]]) } },
    reply: vi.fn(),
    react: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfig.mockReturnValue({
    DISCORD_ENABLE_MESSAGE_PROMPTS: false,
    DISCORD_ENABLE_ATTACHMENT_MESSAGES: false,
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

  it("ignores normal attachment messages when the attachment flag is disabled", async () => {
    const attachment = { name: "note.txt", size: 10, url: "https://cdn.example/note.txt" };
    const message = makeMessage("inspect this", [attachment]);

    await handleMessage(message as never);

    expect(mocks.sessionManager.sendMessage).not.toHaveBeenCalled();
    expect(message.reply).not.toHaveBeenCalled();
  });

  it("asks for an instruction instead of blindly sending a promptless attachment", async () => {
    mocks.getConfig.mockReturnValue({
      DISCORD_ENABLE_MESSAGE_PROMPTS: false,
      DISCORD_ENABLE_ATTACHMENT_MESSAGES: true,
      DISCORD_QUEUE_MAX_ITEMS: 10,
    });
    const attachment = { name: "note.txt", size: 10, url: "https://cdn.example/note.txt" };
    const message = makeMessage("", [attachment]);

    await handleMessage(message as never);

    expect(message.reply).toHaveBeenCalledWith(expect.stringContaining("I can see an attachment"));
    expect(mocks.sessionManager.sendMessage).not.toHaveBeenCalled();
  });

  it("downloads an enabled normal attachment message with an instruction", async () => {
    mocks.getConfig.mockReturnValue({
      DISCORD_ENABLE_MESSAGE_PROMPTS: false,
      DISCORD_ENABLE_ATTACHMENT_MESSAGES: true,
      DISCORD_QUEUE_MAX_ITEMS: 10,
    });
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "attys-message-"));
    mocks.getProject.mockReturnValue({
      channel_id: "channel-1",
      project_path: projectPath,
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("hello") as never);
    const attachment = { name: "note.txt", size: 10, url: "https://cdn.example/note.txt" };
    const message = makeMessage("inspect this file", [attachment]);

    await handleMessage(message as never);

    expect(mocks.sessionManager.sendMessage).toHaveBeenCalledWith(
      message.channel,
      expect.stringContaining("[Attached files - inspect these local files]"),
    );
    expect(fetchSpy).toHaveBeenCalledWith("https://cdn.example/note.txt");
    fetchSpy.mockRestore();
    fs.rmSync(projectPath, { recursive: true, force: true });
  });
});
