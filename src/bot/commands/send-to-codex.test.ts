import { describe, expect, it, vi, beforeEach } from "vitest";
import { ApplicationCommandType } from "discord.js";

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

import { data, execute, handleModalSubmit } from "./send-to-codex.js";

function makeInteraction(content: string, attachments: unknown[] = []) {
  return {
    channelId: "channel-1",
    user: { id: "user-1" },
    channel: {
      isTextBased: () => true,
      isDMBased: () => false,
    },
    targetMessage: {
      content,
      attachments: new Map(attachments.map((attachment, index) => [`a-${index}`, attachment])),
    },
    deferReply: vi.fn(),
    editReply: vi.fn(),
    reply: vi.fn(),
    showModal: vi.fn(),
  };
}

function makeModalInteraction(customId: string, prompt: string) {
  return {
    customId,
    channelId: "channel-1",
    user: { id: "user-1" },
    channel: {
      isTextBased: () => true,
      isDMBased: () => false,
    },
    fields: {
      getTextInputValue: vi.fn(() => prompt),
    },
    deferReply: vi.fn(),
    editReply: vi.fn(),
    reply: vi.fn(),
  };
}

describe("Send to Codex message command", () => {
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
    mocks.buildAttachmentPromptSuffix.mockImplementation((items: unknown[]) =>
      items.length > 0
        ? "\n\n[Attached files - inspect these local files]\n/projects/app/.codex-uploads/note.txt"
        : "",
    );
  });

  it("registers as a message context menu command", () => {
    const json = data.toJSON();

    expect(json.name).toBe("Send to Codex");
    expect(json.type).toBe(ApplicationCommandType.Message);
  });

  it("sends a selected message attachment to Codex without echoing local paths", async () => {
    const attachment = { name: "note.txt", size: 100, url: "https://cdn.example/note.txt" };
    const interaction = makeInteraction("file: inspect this upload", [attachment]);

    await execute(interaction as never);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(mocks.downloadAttachment).toHaveBeenCalledWith(attachment, "/projects/app");
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "Message sent to local Codex.\nAttachment saved for Codex: `note.txt`\n```text\ninspect this upload\n```",
    });
    expect(interaction.editReply.mock.calls[0][0].content).not.toContain("/projects/app");
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      interaction.channel,
      "inspect this upload\n\n[Attached files - inspect these local files]\n/projects/app/.codex-uploads/note.txt",
    );
  });

  it("opens a prompt modal when the selected message only has an attachment", async () => {
    const attachment = { name: "screenshot.png", size: 100, url: "https://cdn.example/screenshot.png" };
    const interaction = makeInteraction("", [attachment]);

    await execute(interaction as never);

    expect(interaction.showModal).toHaveBeenCalledWith(expect.any(Object));
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("sends modal prompt text with the pending selected attachment", async () => {
    const attachment = { name: "screenshot.png", size: 100, url: "https://cdn.example/screenshot.png" };
    const interaction = makeInteraction("", [attachment]);

    await execute(interaction as never);

    const modal = interaction.showModal.mock.calls[0][0];
    const modalInteraction = makeModalInteraction(modal.toJSON().custom_id, "nezd at ezt a kepet");

    expect(await handleModalSubmit(modalInteraction as never)).toBe(true);
    expect(modalInteraction.deferReply).toHaveBeenCalled();
    expect(mocks.sendMessage.mock.calls[0][1]).toContain("nezd at ezt a kepet");
    expect(mocks.sendMessage.mock.calls[0][1]).toContain("[Attached files - inspect these local files]");
  });

  it("queues the selected message when a Codex task is already active", async () => {
    mocks.isActive.mockReturnValue(true);
    const attachment = { name: "note.txt", size: 100, url: "https://cdn.example/note.txt" };
    const interaction = makeInteraction("file: queue this", [attachment]);

    await execute(interaction as never);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(mocks.setPendingQueue).toHaveBeenCalledWith(
      "channel-1",
      interaction.channel,
      "queue this\n\n[Attached files - inspect these local files]\n/projects/app/.codex-uploads/note.txt",
    );
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "⏳ A previous task is in progress. Process this automatically when done?\nAttachment saved for Codex: `note.txt`",
      components: [expect.any(Object)],
    });
  });
});
