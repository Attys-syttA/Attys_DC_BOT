import { beforeEach, describe, expect, it, vi } from "vitest";

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps only allowlisted helpers to BotOps capabilities", () => {
    expect(resolveWindowsHelperCapability("status")).toBe("status.read");
    expect(resolveWindowsHelperCapability("check")).toBe("audit.check");
    expect(resolveWindowsHelperCapability("commit")).toBe("git.commit");
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
      content: "`/windows helper-run` rejected an unsupported helper. Allowed helpers: `status`, `check`, `commit`, `push`, `restart`.",
    });
  });

  it("rejects commit jobs without a message before creating a job", async () => {
    const interaction = {
      options: {
        getSubcommand: vi.fn(() => "helper-run"),
        getString: vi.fn((name: string) => name === "helper" ? "commit" : null),
      },
      user: {
        id: "operator-1",
      },
      editReply: vi.fn(),
    };

    await execute(interaction as never);

    expect(mocks.createOrGetBotOpsJob).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "`/windows helper-run helper:commit` requires `message:<commit message>`.",
    });
  });

  it("stores commit messages in the job payload", async () => {
    const job = {
      job_id: "commit-1",
      requested_by: "operator-1",
      target: "windows",
      capability: "git.commit",
      status: "WaitingApproval",
      approval_state: "required",
      approved_by: null,
      approval_expires_at: null,
      summary: "Windows fixed helper request: commit staged changes",
      payload_json: JSON.stringify({ message: "feat: test commit" }),
      expected_action: "commit already staged source changes",
      validation_condition: "commit succeeds after diff-check and secret scan",
      lease_owner: null,
      lease_expires_at: null,
      heartbeat_at: null,
      logs: "",
      result: "",
      created_at: "2026-08-18T10:00:00.000Z",
      updated_at: "2026-08-18T10:00:00.000Z",
    };
    mocks.createOrGetBotOpsJob.mockReturnValueOnce({ job, created: true });
    const interaction = {
      options: {
        getSubcommand: vi.fn(() => "helper-run"),
        getString: vi.fn((name: string) => {
          if (name === "helper") return "commit";
          if (name === "message") return "feat: test commit";
          return null;
        }),
      },
      user: {
        id: "operator-1",
      },
      editReply: vi.fn(),
    };

    await execute(interaction as never);

    expect(mocks.createOrGetBotOpsJob).toHaveBeenCalledWith(expect.objectContaining({
      capability: "git.commit",
      payload_json: JSON.stringify({ message: "feat: test commit" }),
      summary: "Windows fixed helper request: commit staged changes",
      expected_action: "commit already staged source changes",
      validation_condition: "commit succeeds after diff-check and secret scan",
    }));
  });
});
