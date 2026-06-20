import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  checkRateLimit: vi.fn(),
  sendMessage: vi.fn(),
  downloadAttachment: vi.fn(),
  buildAttachmentPromptSuffix: vi.fn(),
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
  },
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
});
