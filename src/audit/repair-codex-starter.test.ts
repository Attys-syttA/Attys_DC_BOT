import { describe, expect, it, vi } from "vitest";
import { createAuditRepairCodexStarter } from "./repair-codex-starter.js";

describe("createAuditRepairCodexStarter", () => {
  it("starts a Codex thread in the isolated repair worktree and starts one turn", async () => {
    const client = {
      startThread: vi.fn(async () => ({ id: "thread-1" })),
      startTurn: vi.fn(async () => ({ id: "turn-1" })),
    };

    const startRepair = createAuditRepairCodexStarter(client);
    const result = await startRepair("C:\\isolated\\repair-worktree", "repair prompt");

    expect(client.startThread).toHaveBeenCalledWith("C:\\isolated\\repair-worktree");
    expect(client.startTurn).toHaveBeenCalledWith("thread-1", "repair prompt");
    expect(result).toEqual({ threadId: "thread-1", turnId: "turn-1" });
  });

  it("does not start a turn when thread creation fails", async () => {
    const client = {
      startThread: vi.fn(async () => {
        throw new Error("thread failed");
      }),
      startTurn: vi.fn(async () => ({ id: "turn-1" })),
    };

    const startRepair = createAuditRepairCodexStarter(client);

    await expect(startRepair("C:\\isolated\\repair-worktree", "repair prompt")).rejects.toThrow("thread failed");
    expect(client.startTurn).not.toHaveBeenCalled();
  });
});
