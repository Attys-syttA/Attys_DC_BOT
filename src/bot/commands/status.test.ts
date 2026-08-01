import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getAllProjects: vi.fn(),
  getSession: vi.fn(),
  getLatestAuditJob: vi.fn(),
  listAuditSteps: vi.fn(),
  isActive: vi.fn(),
  getQueueSize: vi.fn(),
  getOperatorRuntimeSnapshot: vi.fn(),
}));

vi.mock("../../db/database.js", () => ({
  getAllProjects: mocks.getAllProjects,
  getSession: mocks.getSession,
  getLatestAuditJob: mocks.getLatestAuditJob,
  listAuditSteps: mocks.listAuditSteps,
}));

vi.mock("../../codex/session-manager.js", () => ({
  sessionManager: {
    isActive: mocks.isActive,
    getQueueSize: mocks.getQueueSize,
    getOperatorRuntimeSnapshot: mocks.getOperatorRuntimeSnapshot,
  },
}));

import { execute } from "./status.js";

function makeInteraction() {
  return {
    guildId: "guild-1",
    editReply: vi.fn(),
  };
}

describe("/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAllProjects.mockReturnValue([
      {
        channel_id: "channel-1",
        project_path: "/projects/app",
        auto_approve: 0,
      },
    ]);
    mocks.getSession.mockReturnValue({
      status: "idle",
      last_activity: "2026-06-20 20:00:00",
    });
    mocks.isActive.mockReturnValue(false);
    mocks.getQueueSize.mockReturnValue(0);
    mocks.getOperatorRuntimeSnapshot.mockReturnValue({
      pendingApproval: false,
      pendingQuestion: false,
      pendingCustomInput: false,
      pendingQueuePrompt: false,
    });
    mocks.getLatestAuditJob.mockReturnValue(undefined);
    mocks.listAuditSteps.mockReturnValue([]);
  });

  it("reports no registered projects", async () => {
    mocks.getAllProjects.mockReturnValue([]);
    const interaction = makeInteraction();

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "No projects registered. Use `/register` in a channel first.",
    });
  });

  it("shows public-safe project labels plus runtime queue and pending state", async () => {
    mocks.isActive.mockReturnValue(true);
    mocks.getQueueSize.mockReturnValue(2);
    mocks.getOperatorRuntimeSnapshot.mockReturnValue({
      pendingApproval: false,
      pendingQuestion: true,
      pendingCustomInput: false,
      pendingQueuePrompt: false,
    });
    const interaction = makeInteraction();

    await execute(interaction as never);

    const payload = interaction.editReply.mock.calls[0][0];
    const fieldValue = payload.embeds[0].data.fields[0].value;
    expect(fieldValue).toContain("`<local-path>/app`");
    expect(fieldValue).toContain("Status: **idle**");
    expect(fieldValue).toContain("Runtime: **active**");
    expect(fieldValue).toContain("Queue: **2**");
    expect(fieldValue).toContain("Pending: **question**");
    expect(fieldValue).toContain("Audit: **none**");
    expect(fieldValue).not.toContain("/projects/app");
  });

  it("shows latest audit state for each project", async () => {
    mocks.getLatestAuditJob.mockReturnValue({
      id: "audit-job-1",
      status: "waiting_manual_review",
    });
    mocks.listAuditSteps.mockReturnValue([{
      step_name: "tests",
      status: "failed",
    }]);
    const interaction = makeInteraction();

    await execute(interaction as never);

    const payload = interaction.editReply.mock.calls[0][0];
    const fieldValue = payload.embeds[0].data.fields[0].value;
    expect(fieldValue).toContain("Audit: **waiting_manual_review tests:failed failed:1**");
  });
});
