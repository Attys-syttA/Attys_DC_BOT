import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  checkRateLimit: vi.fn(),
  sendMessage: vi.fn(),
  isActive: vi.fn(),
  hasQueue: vi.fn(),
  isQueueFull: vi.fn(),
  setPendingQueue: vi.fn(),
  downloadAttachment: vi.fn(),
  buildAttachmentPromptSuffix: vi.fn(),
  getConfig: vi.fn(),
}));

vi.mock("../../db/database.js", () => ({
  getProject: mocks.getProject,
}));

vi.mock("../../security/guard.js", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("../../codex/session-manager.js", () => ({
  sessionManager: {
    sendMessage: mocks.sendMessage,
    isActive: mocks.isActive,
    hasQueue: mocks.hasQueue,
    isQueueFull: mocks.isQueueFull,
    setPendingQueue: mocks.setPendingQueue,
  },
}));

vi.mock("../../utils/config.js", () => ({
  getConfig: mocks.getConfig,
}));

vi.mock("../attachments.js", () => ({
  downloadAttachment: mocks.downloadAttachment,
  buildAttachmentPromptSuffix: mocks.buildAttachmentPromptSuffix,
}));

import { execute } from "./ask.js";

function makeInteraction(prompt: string, attachment: unknown = null) {
  return {
    channelId: "channel-1",
    user: { id: "user-1" },
    channel: {
      isTextBased: () => true,
      isDMBased: () => false,
    },
    options: {
      getString: vi.fn(() => prompt),
      getAttachment: vi.fn(() => attachment),
    },
    editReply: vi.fn(),
  };
}

describe("/ask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProject.mockReturnValue({ channel_id: "channel-1", project_path: "/projects/app" });
    mocks.checkRateLimit.mockReturnValue(true);
    mocks.getConfig.mockReturnValue({ DISCORD_QUEUE_MAX_ITEMS: 10 });
    mocks.isActive.mockReturnValue(false);
    mocks.hasQueue.mockReturnValue(false);
    mocks.isQueueFull.mockReturnValue(false);
    mocks.downloadAttachment.mockResolvedValue({
      filePath: "/projects/app/.codex-uploads/note.txt",
      isImage: false,
      safeName: "note.txt",
    });
    mocks.buildAttachmentPromptSuffix.mockReturnValue("\n\n[Attached files - inspect these local files]\n/projects/app/.codex-uploads/note.txt");
  });

  it("rejects unregistered channels", async () => {
    mocks.getProject.mockReturnValue(undefined);
    const interaction = makeInteraction("hello");

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "This channel is not registered to any project.",
    });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("sends a trimmed prompt to the local session manager", async () => {
    const interaction = makeInteraction("  inspect this repo  ");

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Prompt sent to local Codex.\n```text\ninspect this repo\n```",
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith(interaction.channel, "inspect this repo");
  });

  it("escapes code fences in the visible prompt echo", async () => {
    const interaction = makeInteraction("show ``` fenced");

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Prompt sent to local Codex.\n```text\nshow ''' fenced\n```",
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith(interaction.channel, "show ``` fenced");
  });

  it("downloads an optional slash attachment without echoing the local path", async () => {
    const attachment = { name: "note.txt", size: 100, url: "https://cdn.example/note.txt" };
    const interaction = makeInteraction("inspect this file", attachment);

    await execute(interaction as never);

    expect(mocks.downloadAttachment).toHaveBeenCalledWith(attachment, "/projects/app");
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Prompt sent to local Codex.\nAttachment saved for Codex: `note.txt`\n```text\ninspect this file\n```",
    });
    expect(interaction.editReply.mock.calls[0][0].content).not.toContain("/projects/app");
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      interaction.channel,
      "inspect this file\n\n[Attached files - inspect these local files]\n/projects/app/.codex-uploads/note.txt",
    );
  });

  it("reports skipped slash attachments and still sends the prompt", async () => {
    const attachment = { name: "tool.exe", size: 100, url: "https://cdn.example/tool.exe" };
    mocks.downloadAttachment.mockResolvedValue({ skipped: "Blocked: `tool.exe` (dangerous file type)" });
    const interaction = makeInteraction("ignore unsafe file", attachment);

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Prompt sent to local Codex.\nBlocked: `tool.exe` (dangerous file type)\n```text\nignore unsafe file\n```",
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith(interaction.channel, "ignore unsafe file");
  });

  it("offers queue confirmation instead of starting another turn when active", async () => {
    mocks.isActive.mockReturnValue(true);
    const interaction = makeInteraction("queue this");

    await execute(interaction as never);

    expect(mocks.setPendingQueue).toHaveBeenCalledWith("channel-1", interaction.channel, "queue this");
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "⏳ A previous task is in progress. Process this automatically when done?",
      components: [expect.any(Object)],
    });
  });

  it("does not replace an existing pending queue confirmation", async () => {
    mocks.isActive.mockReturnValue(true);
    mocks.hasQueue.mockReturnValue(true);
    const interaction = makeInteraction("queue this");

    await execute(interaction as never);

    expect(mocks.setPendingQueue).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "⏳ A message is already waiting to be queued. Please press the button first.",
    });
  });

  it("reports full queue for slash prompts", async () => {
    mocks.isActive.mockReturnValue(true);
    mocks.isQueueFull.mockReturnValue(true);
    mocks.getConfig.mockReturnValue({ DISCORD_QUEUE_MAX_ITEMS: 2 });
    const interaction = makeInteraction("queue this");

    await execute(interaction as never);

    expect(mocks.setPendingQueue).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "⏳ Queue is full (max 2). Please wait for the current task to finish.",
    });
  });
});
