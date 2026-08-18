import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createOrGetBotOpsJob: vi.fn(),
  listBotOpsWorkerHeartbeats: vi.fn(() => []),
}));

vi.mock("../../db/database.js", () => ({
  createOrGetBotOpsJob: mocks.createOrGetBotOpsJob,
  listBotOpsWorkerHeartbeats: mocks.listBotOpsWorkerHeartbeats,
}));

import { execute, resolveWindowsHelperCapability } from "./windows.js";

describe("/windows helper-run", () => {
  it("maps only allowlisted helpers to BotOps capabilities", () => {
    expect(resolveWindowsHelperCapability("status")).toBe("status.read");
    expect(resolveWindowsHelperCapability("check")).toBe("audit.check");
    expect(resolveWindowsHelperCapability("push")).toBe("git.push");
    expect(resolveWindowsHelperCapability("restart")).toBe("service.restart");
    expect(resolveWindowsHelperCapability("shell")).toBeUndefined();
  });

  it("rejects unsupported helper payloads before creating a job", async () => {
    const interaction = {
      options: {
        getSubcommand: vi.fn(() => "helper-run"),
        getString: vi.fn((name: string) => name === "helper" ? "shell" : null),
      },
      user: {
        id: "operator-1",
      },
      editReply: vi.fn(),
    };

    await execute(interaction as never);

    expect(mocks.createOrGetBotOpsJob).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "`/windows helper-run` rejected an unsupported helper. Allowed helpers: `status`, `check`, `push`, `restart`.",
    });
  });
});
