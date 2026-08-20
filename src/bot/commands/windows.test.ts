import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BotOpsJob } from "../../botops/contract.js";

const mocks = vi.hoisted(() => ({
  createOrGetBotOpsJob: vi.fn(),
  listBotOpsWorkerHeartbeats: vi.fn(() => []),
}));

vi.mock("../../db/database.js", () => ({
  createOrGetBotOpsJob: mocks.createOrGetBotOpsJob,
  listBotOpsWorkerHeartbeats: mocks.listBotOpsWorkerHeartbeats,
}));

import { buildWindowsHelperQueuedReply, execute, resolveWindowsHelperCapability } from "./windows.js";

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
    const job: BotOpsJob = {
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

  it("stores fetch-aware push approval metadata", async () => {
    const job: BotOpsJob = {
      job_id: "push-1",
      requested_by: "operator-1",
      target: "windows",
      capability: "git.push",
      status: "WaitingApproval",
      approval_state: "required",
      approved_by: null,
      approval_expires_at: null,
      summary: "Windows fixed helper request: push",
      payload_json: "",
      expected_action: "fetch remote refs and push the current clean branch to its upstream",
      validation_condition: "fetch succeeds, branch is not behind upstream, and push succeeds without force or rebase",
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
        getString: vi.fn((name: string) => name === "helper" ? "push" : null),
      },
      user: {
        id: "operator-1",
      },
      editReply: vi.fn(),
    };

    await execute(interaction as never);

    expect(mocks.createOrGetBotOpsJob).toHaveBeenCalledWith(expect.objectContaining({
      capability: "git.push",
      expected_action: "fetch remote refs and push the current clean branch to its upstream",
      validation_condition: "fetch succeeds, branch is not behind upstream, and push succeeds without force or rebase",
    }));
  });

  it("explains commit approval scope and next review step", () => {
    const job: BotOpsJob = {
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

    const reply = buildWindowsHelperQueuedReply(job, "commit", true);

    expect(reply).toContain("**Windows helper approval requested**");
    expect(reply).toContain("git publication step: commit");
    expect(reply).toContain("preflight: staged changes only, no unstaged or untracked files");
    expect(reply).toContain("validation: git diff --check --cached and changed-files secret scan");
    expect(reply).toContain("blocked actions: staging files, push, deploy, restart, cleanup");
    expect(reply).toContain("Review with `/ops preview`, then approve or cancel the BotOps job.");
  });

  it("explains push approval scope without implying force, merge, or rebase", () => {
    const job: BotOpsJob = {
      job_id: "push-1",
      requested_by: "operator-1",
      target: "windows",
      capability: "git.push",
      status: "WaitingApproval",
      approval_state: "required",
      approved_by: null,
      approval_expires_at: null,
      summary: "Windows fixed helper request: push",
      payload_json: "",
      expected_action: "fetch remote refs and push the current clean branch to its upstream",
      validation_condition: "fetch succeeds, branch is not behind upstream, and push succeeds without force or rebase",
      lease_owner: null,
      lease_expires_at: null,
      heartbeat_at: null,
      logs: "",
      result: "",
      created_at: "2026-08-18T10:00:00.000Z",
      updated_at: "2026-08-18T10:00:00.000Z",
    };

    const reply = buildWindowsHelperQueuedReply(job, "push", true);

    expect(reply).toContain("git publication step: push");
    expect(reply).toContain("preflight: clean worktree, configured upstream, fixed git fetch --prune");
    expect(reply).toContain("validation: branch is not behind upstream and git push succeeds");
    expect(reply).toContain("blocked actions: commit, merge, rebase, force push, deploy, restart");
    expect(reply).not.toContain("force push allowed");
  });
});
