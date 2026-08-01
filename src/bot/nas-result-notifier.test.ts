import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  listHandoffEnvelopeFiles: vi.fn(),
  readHandoffEnvelope: vi.fn(),
  expireStaleNasHandoffRequests: vi.fn(),
  getNasHandoffRequest: vi.fn(),
  insertAuditStepResult: vi.fn(),
  updateAuditJobProgress: vi.fn(),
  updateNasHandoffRequestResult: vi.fn(),
  recordOperatorEvent: vi.fn(),
  getConfig: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: mocks.existsSync,
    readFileSync: mocks.readFileSync,
  },
}));

vi.mock("../nas/handoff-store.js", () => ({
  listHandoffEnvelopeFiles: mocks.listHandoffEnvelopeFiles,
  readHandoffEnvelope: mocks.readHandoffEnvelope,
}));

vi.mock("../db/database.js", () => ({
  expireStaleNasHandoffRequests: mocks.expireStaleNasHandoffRequests,
  getNasHandoffRequest: mocks.getNasHandoffRequest,
  insertAuditStepResult: mocks.insertAuditStepResult,
  updateAuditJobProgress: mocks.updateAuditJobProgress,
  updateNasHandoffRequestResult: mocks.updateNasHandoffRequestResult,
}));

vi.mock("./operator-events.js", () => ({
  recordOperatorEvent: mocks.recordOperatorEvent,
}));

vi.mock("../utils/config.js", () => ({
  getConfig: mocks.getConfig,
}));

import {
  buildNasResultNotificationMessage,
  notifyNasHandoffResults,
  reconcileNasHandoffResults,
  startNasResultNotifier,
} from "./nas-result-notifier.js";

describe("NAS result notifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockReturnValue("ATTYS_NAS_HANDOFF_ROOT=K:\\data\\handoff\n");
    mocks.listHandoffEnvelopeFiles.mockReturnValue(["result-1.json"]);
    mocks.readHandoffEnvelope.mockReturnValue({
      type: "audit.result",
      status: "completed",
      createdAt: "2026-08-01T12:01:00.000Z",
      publicSummary: "Audit result",
      publicFields: {
        request: "request-1",
        check: "plans",
        result: "passed",
        summary: "1/1 passed",
      },
    });
    mocks.getConfig.mockReturnValue({
      DISCORD_ENABLE_NAS_RESULT_NOTIFICATIONS: false,
      DISCORD_NAS_RESULT_POLL_INTERVAL_MS: 60_000,
      DISCORD_NAS_REQUEST_STALE_AFTER_MS: 900_000,
    });
    mocks.expireStaleNasHandoffRequests.mockReturnValue([]);
  });

  it("reconciles queued NAS outbox results once", () => {
    mocks.getNasHandoffRequest.mockReturnValue({
      id: "request-1",
      audit_job_id: "audit-job-1",
      channel_id: "channel-1",
      project_label: "Attys_DC_BOT",
      check_name: "plans",
      status: "queued",
      result_summary: null,
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    });

    expect(reconcileNasHandoffResults("repo")).toEqual([{
      channelId: "channel-1",
      requestId: "request-1",
      checkName: "plans",
      status: "completed",
      summary: "1/1 passed",
      updatedAt: "2026-08-01T12:01:00.000Z",
    }]);
    expect(mocks.updateNasHandoffRequestResult).toHaveBeenCalledWith(
      "request-1",
      "completed",
      "1/1 passed",
      "2026-08-01T12:01:00.000Z",
    );
    expect(mocks.insertAuditStepResult).toHaveBeenCalledWith(
      "audit-job-1",
      expect.objectContaining({
        name: "plans",
        status: "passed",
        exitCode: 0,
        publicOutput: "1/1 passed",
      }),
    );
    expect(mocks.updateAuditJobProgress).toHaveBeenCalledWith(
      "audit-job-1",
      "completed",
      null,
      1,
      "2026-08-01T12:01:00.000Z",
    );
  });

  it("does not notify already completed requests again", () => {
    mocks.getNasHandoffRequest.mockReturnValue({
      id: "request-1",
      channel_id: "channel-1",
      project_label: "Attys_DC_BOT",
      check_name: "plans",
      status: "completed",
      result_summary: "1/1 passed",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:01:00.000Z",
    });

    expect(reconcileNasHandoffResults("repo")).toEqual([]);
    expect(mocks.updateNasHandoffRequestResult).not.toHaveBeenCalled();
  });

  it("creates failed notifications for stale queued NAS requests", () => {
    mocks.listHandoffEnvelopeFiles.mockReturnValue([]);
    mocks.expireStaleNasHandoffRequests.mockReturnValue([{
      id: "stale-request-1",
      audit_job_id: "audit-stale-1",
      channel_id: "channel-1",
      project_label: "Attys_DC_BOT",
      check_name: "plans",
      status: "failed",
      result_summary: "no NAS result before stale timeout",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:15:00.000Z",
    }]);

    expect(reconcileNasHandoffResults("repo")).toEqual([{
      channelId: "channel-1",
      requestId: "stale-request-1",
      checkName: "plans",
      status: "failed",
      summary: "no NAS result before stale timeout",
      updatedAt: "2026-08-01T12:15:00.000Z",
    }]);
    expect(mocks.expireStaleNasHandoffRequests).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
    );
    expect(mocks.updateAuditJobProgress).toHaveBeenCalledWith(
      "audit-stale-1",
      "waiting_manual_review",
      null,
      1,
      "2026-08-01T12:15:00.000Z",
    );
  });

  it("expires stale requests even when the NAS outbox is unavailable", () => {
    mocks.existsSync.mockReturnValue(false);
    mocks.expireStaleNasHandoffRequests.mockReturnValue([{
      id: "stale-request-1",
      channel_id: "channel-1",
      project_label: "Attys_DC_BOT",
      check_name: "plans",
      status: "failed",
      result_summary: "no NAS result before stale timeout",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:15:00.000Z",
    }]);

    expect(reconcileNasHandoffResults("repo")).toEqual([{
      channelId: "channel-1",
      requestId: "stale-request-1",
      checkName: "plans",
      status: "failed",
      summary: "no NAS result before stale timeout",
      updatedAt: "2026-08-01T12:15:00.000Z",
    }]);
    expect(mocks.expireStaleNasHandoffRequests).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
    );
    expect(mocks.listHandoffEnvelopeFiles).not.toHaveBeenCalled();
  });

  it("sends public-safe result messages to the request channel", async () => {
    const send = vi.fn();
    mocks.getNasHandoffRequest.mockReturnValue({
      id: "request-1",
      channel_id: "channel-1",
      project_label: "Attys_DC_BOT",
      check_name: "plans",
      status: "queued",
      result_summary: null,
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    });

    const client = {
      channels: {
        fetch: vi.fn(async () => ({
          isSendable: () => true,
          send,
        })),
      },
    };

    await expect(notifyNasHandoffResults(client as never, "repo")).resolves.toBe(1);
    expect(send).toHaveBeenCalledWith({
      content: expect.stringContaining("request request-1 check=plans status=completed"),
    });
    expect(mocks.recordOperatorEvent).toHaveBeenCalledWith(
      { kind: "task", status: "nas-result-completed", channelId: "channel-1" },
      "repo",
    );
  });

  it("keeps the startup poller disabled by default", () => {
    const client = { channels: { fetch: vi.fn() } };

    expect(startNasResultNotifier(client as never, "repo")).toBeNull();
  });

  it("builds compact public-safe Discord output", () => {
    const message = buildNasResultNotificationMessage({
      channelId: "channel-1",
      requestId: "request-1234567890",
      checkName: "plans",
      status: "completed",
      summary: "1/1 passed",
      updatedAt: "2026-08-01T12:01:00.000Z",
    });

    expect(message).toContain("NAS Handoff Result");
    expect(message).toContain("request request-1234");
    expect(message).toContain("summary=1/1 passed");
  });
});
