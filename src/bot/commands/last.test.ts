import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  getSession: vi.fn(),
  readThread: vi.fn(),
  getStoredThread: vi.fn(),
}));

vi.mock("../../db/database.js", () => ({
  getProject: mocks.getProject,
  getSession: mocks.getSession,
}));

vi.mock("../../codex/app-server-client.js", () => ({
  codexAppServer: {
    readThread: mocks.readThread,
  },
}));

vi.mock("../../codex/storage.js", () => ({
  getStoredThread: mocks.getStoredThread,
}));

import { execute, lastResponseFromThread } from "./last.js";

const tempFiles: string[] = [];

afterEach(() => {
  for (const file of tempFiles.splice(0)) {
    fs.rmSync(file, { force: true });
  }
});

function makeInteraction() {
  return {
    channelId: "channel-1",
    editReply: vi.fn(),
    followUp: vi.fn(),
  };
}

function makeRolloutFile(lines: unknown[]): string {
  const filePath = path.join(os.tmpdir(), `attys-last-${Date.now()}-${Math.random()}.jsonl`);
  fs.writeFileSync(filePath, lines.map((line) => JSON.stringify(line)).join("\n"), "utf8");
  tempFiles.push(filePath);
  return filePath;
}

describe("/last", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProject.mockReturnValue({ channel_id: "channel-1", project_path: "/projects/app" });
    mocks.getSession.mockReturnValue({ session_id: "thread-1" });
    mocks.getStoredThread.mockReturnValue(undefined);
  });

  it("extracts the latest agent message from a live thread", () => {
    expect(lastResponseFromThread({
      turns: [
        { items: [{ type: "agentMessage", text: "first" }] },
        { items: [{ type: "agentMessage", text: "second" }] },
      ],
    })).toBe("second");
  });

  it("shows the live thread last response", async () => {
    mocks.readThread.mockResolvedValue({
      turns: [{ items: [{ type: "agentMessage", text: "Live answer" }] }],
    });
    const interaction = makeInteraction();

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({ content: "Live answer" });
  });

  it("falls back to the stored rollout log when live read fails", async () => {
    mocks.readThread.mockRejectedValue(new Error("app-server unavailable"));
    const rolloutPath = makeRolloutFile([
      { type: "item_completed", item: { type: "agentMessage", text: "Stored answer" } },
    ]);
    mocks.getStoredThread.mockReturnValue({ id: "thread-1", rollout_path: rolloutPath });
    const interaction = makeInteraction();

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({ content: "Stored answer" });
  });

  it("reports no response when neither live nor stored sources have output", async () => {
    mocks.readThread.mockRejectedValue(new Error("app-server unavailable"));
    const interaction = makeInteraction();

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "No Codex response in this session.",
    });
  });
});
