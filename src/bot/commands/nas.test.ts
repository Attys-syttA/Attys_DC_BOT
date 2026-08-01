import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  getConfig: vi.fn(),
  readPublicHandoffStore: vi.fn(),
  listHandoffEnvelopeFiles: vi.fn(),
  readHandoffEnvelope: vi.fn(),
  createAuditRequestHandoff: vi.fn(),
  getProject: vi.fn(),
  createNasHandoffRequest: vi.fn(),
  expireStaleNasHandoffRequests: vi.fn(),
  countNasHandoffRequestsByStatus: vi.fn(),
  getNasHandoffRequest: vi.fn(),
  listNasHandoffRequests: vi.fn(),
  updateNasHandoffRequestResult: vi.fn(),
  writeHandoffEnvelope: vi.fn(),
  runLocalCommand: vi.fn(),
  recordOperatorEvent: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: mocks.existsSync,
    readFileSync: mocks.readFileSync,
  },
}));

vi.mock("../../utils/config.js", () => ({
  getConfig: mocks.getConfig,
}));

vi.mock("../../nas/handoff-store.js", () => ({
  readPublicHandoffStore: mocks.readPublicHandoffStore,
  listHandoffEnvelopeFiles: mocks.listHandoffEnvelopeFiles,
  readHandoffEnvelope: mocks.readHandoffEnvelope,
  writeHandoffEnvelope: mocks.writeHandoffEnvelope,
}));

vi.mock("../../nas/audit-handoff.js", () => ({
  createAuditRequestHandoff: mocks.createAuditRequestHandoff,
}));

vi.mock("../../db/database.js", () => ({
  countNasHandoffRequestsByStatus: mocks.countNasHandoffRequestsByStatus,
  getProject: mocks.getProject,
  createNasHandoffRequest: mocks.createNasHandoffRequest,
  expireStaleNasHandoffRequests: mocks.expireStaleNasHandoffRequests,
  getNasHandoffRequest: mocks.getNasHandoffRequest,
  listNasHandoffRequests: mocks.listNasHandoffRequests,
  updateNasHandoffRequestResult: mocks.updateNasHandoffRequestResult,
}));

vi.mock("./local-command.js", () => ({
  npmCommand: () => "npm.cmd",
  runLocalCommand: mocks.runLocalCommand,
}));

vi.mock("../operator-events.js", () => ({
  recordOperatorEvent: mocks.recordOperatorEvent,
}));

import {
  buildNasBridgeLifecycleReport,
  buildNasBridgeSmokeReport,
  buildNasResultsReport,
  buildNasStatusReport,
  buildNasSyncStatusReport,
  execute,
  projectFolderLabel,
} from "./nas.js";

function makeInteraction() {
  return {
    options: {
      getSubcommand: vi.fn(() => "status"),
    },
    editReply: vi.fn(),
  };
}

describe("/nas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockReturnValue({
      DISCORD_ENABLE_NAS_STATUS: true,
      DISCORD_ENABLE_NAS_BRIDGE_SMOKE: false,
      DISCORD_ENABLE_NAS_SYNC_STATUS: false,
      DISCORD_ENABLE_NAS_RESULT_NOTIFICATIONS: false,
      DISCORD_NAS_RESULT_POLL_INTERVAL_MS: 60_000,
      DISCORD_NAS_REQUEST_STALE_AFTER_MS: 900_000,
    });
    mocks.expireStaleNasHandoffRequests.mockReturnValue([]);
    mocks.countNasHandoffRequestsByStatus.mockReturnValue({
      queued: 1,
      completed: 2,
      failed: 3,
    });
    mocks.createAuditRequestHandoff.mockImplementation((input) => ({
      id: "request-1",
      type: "audit.request",
      publicFields: {
        check: input.checkName,
        project: input.projectLabel,
      },
    }));
    mocks.getProject.mockReturnValue({ channel_id: "channel-1", project_path: "E:\\codex_works\\Attys_DC_BOT" });
    mocks.getNasHandoffRequest.mockReturnValue({ id: "request-one" });
    mocks.listNasHandoffRequests.mockReturnValue([
      {
        id: "request-one",
        check_name: "plans",
        status: "completed",
        result_summary: "1/1 passed",
      },
      {
        id: "request-two",
        check_name: "tests",
        status: "failed",
        result_summary: "0/1 passed",
      },
    ]);
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockImplementation((filePath: string) => {
      if (filePath.endsWith("nas-control-plane-status.json")) {
        return JSON.stringify({
          buildInfo: {
            sourceCommit: "ebfa22a9abcd",
            packageVersion: "0.1.1-prerelease.2",
            generatedAt: "2026-08-01T19:19:43Z",
            includeSource: true,
          },
          handoffStore: {
            rootStatus: "ready",
          },
          checkedAt: "2026-08-01T19:20:00.000Z",
        });
      }
      return "ATTYS_NAS_HANDOFF_ROOT=K:\\data\\handoff\nATTYS_WORKER_SHARED_SECRET_HOME=hidden\n";
    });
    mocks.readPublicHandoffStore.mockReturnValue({
      rootStatus: "ready",
      boxes: [
        { box: "inbox", validMessages: 0 },
        { box: "outbox", validMessages: 2 },
        { box: "archive", validMessages: 2 },
      ],
    });
    mocks.listHandoffEnvelopeFiles.mockReturnValue([
      "K:\\data\\handoff\\outbox\\result-1.json",
      "K:\\data\\handoff\\outbox\\result-2.json",
    ]);
    mocks.readHandoffEnvelope
      .mockReturnValueOnce({
        type: "audit.result",
        createdAt: "2026-08-01T12:00:00.000Z",
        status: "completed",
        publicSummary: "Audit result",
        publicFields: {
          request: "request-one",
          check: "plans",
          result: "passed",
          summary: "1/1 passed",
        },
      })
      .mockReturnValueOnce({
        type: "audit.result",
        createdAt: "2026-08-01T12:01:00.000Z",
        status: "failed",
        publicSummary: "Audit result",
        publicFields: {
          request: "request-two",
          check: "tests",
          result: "failed",
          summary: "0/1 passed",
        },
      });
    mocks.runLocalCommand
      .mockResolvedValueOnce({
        exitCode: 0,
        timedOut: false,
        output: "{\"running\":true,\"listening\":true,\"port\":8787,\"processCount\":3,\"processIds\":[1,2,3]}",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        timedOut: false,
        output: "{\"running\":true,\"processCount\":3,\"processIds\":[4,5,6],\"handoffRootConfigured\":true,\"handoffRootReachable\":true}",
      });
  });

  it("is disabled unless explicitly enabled", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_NAS_STATUS: false });
    const interaction = makeInteraction();

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "`/nas` is disabled. Set `DISCORD_ENABLE_NAS_STATUS=true` in `.env` to enable it.",
    });
    expect(mocks.runLocalCommand).not.toHaveBeenCalled();
  });

  it("queues a fixed NAS handoff request when enabled", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_NAS_HANDOFF: true });
    const interaction = {
      channelId: "channel-1",
      options: {
        getSubcommand: vi.fn(() => "request"),
        getString: vi.fn(() => "plans"),
      },
      editReply: vi.fn(),
    };

    await execute(interaction as never);

    expect(mocks.writeHandoffEnvelope).toHaveBeenCalledWith(
      "K:\\data\\handoff",
      "inbox",
      expect.objectContaining({
        type: "audit.request",
        publicFields: expect.objectContaining({
          check: "plans",
          project: "Attys_DC_BOT",
        }),
      }),
    );
    expect(mocks.createNasHandoffRequest).toHaveBeenCalledWith(expect.objectContaining({
      id: "request-1",
      channelId: "channel-1",
      projectLabel: "Attys_DC_BOT",
      checkName: "plans",
      status: "queued",
    }));
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: expect.stringContaining("Queued NAS audit request"),
    });
  });

  it("derives project labels from Windows and POSIX paths", () => {
    expect(projectFolderLabel("E:\\codex_works\\Attys_DC_BOT")).toBe("Attys_DC_BOT");
    expect(projectFolderLabel("/home/operator/codex_works/Attys_DC_BOT")).toBe("Attys_DC_BOT");
  });

  it("keeps NAS handoff request disabled by default", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_NAS_HANDOFF: false });
    const interaction = {
      channelId: "channel-1",
      options: {
        getSubcommand: vi.fn(() => "request"),
        getString: vi.fn(() => "plans"),
      },
      editReply: vi.fn(),
    };

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "`/nas request` is disabled. Set `DISCORD_ENABLE_NAS_HANDOFF=true` in `.env` to enable it.",
    });
    expect(mocks.writeHandoffEnvelope).not.toHaveBeenCalled();
  });

  it("keeps NAS bridge lifecycle disabled by default", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_NAS_BRIDGE_LIFECYCLE: false });
    const interaction = {
      channelId: "channel-1",
      options: {
        getSubcommand: vi.fn(() => "bridge"),
        getString: vi.fn(() => "restart"),
      },
      editReply: vi.fn(),
    };

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "`/nas bridge` is disabled. Set `DISCORD_ENABLE_NAS_BRIDGE_LIFECYCLE=true` in `.env` to enable it.",
    });
    expect(mocks.runLocalCommand).not.toHaveBeenCalled();
  });

  it("runs a fixed NAS bridge lifecycle action when enabled", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_NAS_BRIDGE_LIFECYCLE: true });
    mocks.runLocalCommand.mockReset().mockResolvedValueOnce({
      exitCode: 0,
      timedOut: false,
      output: [
        "local preface E:\\private",
        "{\"bridgeReady\":true,\"http\":{\"running\":true,\"listening\":true,\"port\":8787,\"processCount\":1,\"processIds\":[10]},\"handoff\":{\"running\":true,\"handoffRootConfigured\":true,\"handoffRootReachable\":true,\"processCount\":1,\"processIds\":[11]}}",
      ].join("\n"),
    });
    const interaction = {
      channelId: "channel-1",
      options: {
        getSubcommand: vi.fn(() => "bridge"),
        getString: vi.fn(() => "restart"),
      },
      editReply: vi.fn(),
    };

    await execute(interaction as never);

    expect(mocks.runLocalCommand).toHaveBeenCalledWith(
      "npm.cmd",
      ["run", "--silent", "nas:bridge:restart"],
      expect.any(String),
      45_000,
    );
    expect(interaction.editReply.mock.calls[0][0].content).toContain("NAS Bridge Lifecycle");
    expect(interaction.editReply.mock.calls[0][0].content).toContain("action: restart requested");
    expect(interaction.editReply.mock.calls[0][0].content).toContain("OK bridge ready");
    expect(interaction.editReply.mock.calls[0][0].content).not.toContain("8787");
    expect(interaction.editReply.mock.calls[0][0].content).not.toContain("processIds");
    expect(interaction.editReply.mock.calls[0][0].content).not.toContain("private");
    expect(mocks.recordOperatorEvent).toHaveBeenCalledWith({
      kind: "lifecycle",
      status: "nas-bridge-restart",
      channelId: "channel-1",
    });
  });

  it("keeps NAS bridge smoke disabled by default", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_NAS_BRIDGE_SMOKE: false });
    const interaction = {
      channelId: "channel-1",
      options: {
        getSubcommand: vi.fn(() => "smoke"),
      },
      editReply: vi.fn(),
    };

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "`/nas smoke` is disabled. Set `DISCORD_ENABLE_NAS_BRIDGE_SMOKE=true` in `.env` to enable it.",
    });
    expect(mocks.runLocalCommand).not.toHaveBeenCalled();
  });

  it("runs one fixed NAS bridge smoke when enabled", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_NAS_BRIDGE_SMOKE: true });
    mocks.runLocalCommand.mockReset().mockResolvedValueOnce({
      exitCode: 0,
      timedOut: false,
      output: [
        "raw preface K:\\data token=secret",
        "{\"ok\":true,\"requestId\":\"nas-bridge-smoke-20260801-203000\",\"check\":\"plans\",\"result\":\"passed\",\"summary\":\"1/1 passed\"}",
      ].join("\n"),
    });
    const interaction = {
      channelId: "channel-1",
      options: {
        getSubcommand: vi.fn(() => "smoke"),
      },
      editReply: vi.fn(),
    };

    await execute(interaction as never);

    expect(mocks.runLocalCommand).toHaveBeenCalledWith(
      "npm.cmd",
      ["run", "--silent", "nas:bridge:smoke"],
      expect.any(String),
      90_000,
    );
    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("NAS Bridge Smoke");
    expect(content).toContain("OK smoke completed");
    expect(content).toContain("request=nas-bridge-smoke-20260801-203000");
    expect(content).toContain("check=plans result=passed");
    expect(content).toContain("summary=1/1 passed");
    expect(content).not.toContain("K:\\");
    expect(content).not.toContain("secret");
    expect(mocks.recordOperatorEvent).toHaveBeenCalledWith({
      kind: "task",
      status: "nas-bridge-smoke-passed",
      channelId: "channel-1",
    });
  });

  it("keeps NAS sync status disabled by default", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_NAS_SYNC_STATUS: false });
    const interaction = {
      channelId: "channel-1",
      options: {
        getSubcommand: vi.fn(() => "sync-status"),
      },
      editReply: vi.fn(),
    };

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "`/nas sync-status` is disabled. Set `DISCORD_ENABLE_NAS_SYNC_STATUS=true` in `.env` to enable it.",
    });
    expect(mocks.runLocalCommand).not.toHaveBeenCalled();
  });

  it("shows a public-safe NAS sync dry-run status when enabled", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_NAS_SYNC_STATUS: true });
    mocks.runLocalCommand.mockReset().mockResolvedValueOnce({
      exitCode: 0,
      timedOut: false,
      output: [
        "raw preface K:\\private token=secret",
        "{\"mode\":\"dry-run\",\"targetRoot\":\"<nas-share>\",\"copiedOrReplaced\":2,\"skipped\":41,\"protectedSkipped\":3,\"removeBeforeCopy\":true}",
      ].join("\n"),
    });
    const interaction = {
      channelId: "channel-1",
      options: {
        getSubcommand: vi.fn(() => "sync-status"),
      },
      editReply: vi.fn(),
    };

    await execute(interaction as never);

    expect(mocks.runLocalCommand).toHaveBeenCalledWith(
      "npm.cmd",
      ["run", "--silent", "nas:sync-share"],
      expect.any(String),
      60_000,
    );
    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("NAS Sync Status");
    expect(content).toContain("INFO NAS share has pending managed file changes");
    expect(content).toContain("mode=dry-run");
    expect(content).toContain("pending=2 unchanged=41 protected=3");
    expect(content).toContain("delete-before-copy=enabled");
    expect(content).toContain("writes=disabled");
    expect(content).not.toContain("K:\\");
    expect(content).not.toContain("secret");
    expect(content).not.toContain("targetRoot");
  });

  it("requires a registered project before queuing a NAS request", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_NAS_HANDOFF: true });
    mocks.getProject.mockReturnValue(undefined);
    const interaction = {
      channelId: "channel-1",
      options: {
        getSubcommand: vi.fn(() => "request"),
        getString: vi.fn(() => "plans"),
      },
      editReply: vi.fn(),
    };

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "This channel is not registered to any project.",
    });
    expect(mocks.writeHandoffEnvelope).not.toHaveBeenCalled();
  });

  it("builds a public-safe NAS status report", async () => {
    mocks.getConfig.mockReturnValue({
      DISCORD_ENABLE_NAS_STATUS: true,
      DISCORD_ENABLE_NAS_RESULT_NOTIFICATIONS: true,
      DISCORD_NAS_RESULT_POLL_INTERVAL_MS: 30_000,
      DISCORD_NAS_REQUEST_STALE_AFTER_MS: 900_000,
    });

    const report = await buildNasStatusReport("E:\\private\\repo", "channel-1");

    expect(report).toContain("NAS Bridge Status");
    expect(report).toContain("OK bridge ready: PC worker and NAS handoff are connected");
    expect(report).toContain("OK worker http: listening on configured port, processes 3");
    expect(report).toContain("OK handoff worker: running, NAS root reachable, processes 3");
    expect(report).toContain("OK handoff mailbox: inbox:0 outbox:2 archive:2");
    expect(report).toContain("OK NAS control-plane snapshot: build=ebfa22a9abcd version=0.1.1-prerelease.2 handoff=ready checked=2026-08-01T19:20:00.000Z");
    expect(report).toContain("OK result notifier: enabled, poll 30s");
    expect(report).toContain("OK request stale timeout: 15m");
    expect(report).toContain("OK request tracking: queued:1 completed:2 failed:3");
    expect(mocks.expireStaleNasHandoffRequests).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "channel-1",
    );
    expect(mocks.countNasHandoffRequestsByStatus).toHaveBeenCalledWith("channel-1");
    expect(report).not.toContain("8787");
    expect(report).not.toContain("K:\\");
    expect(report).not.toContain("processIds");
    expect(report).not.toContain("K:\\");
    expect(report).not.toContain("hidden");
    expect(report).not.toContain("private");
  });

  it("builds a public-safe NAS bridge lifecycle report from nested JSON", async () => {
    mocks.runLocalCommand.mockReset().mockResolvedValueOnce({
      exitCode: 0,
      timedOut: false,
      output: [
        "status before json with token=secret",
        "{\"bridgeReady\":true,\"http\":{\"running\":true,\"listening\":true,\"port\":8787,\"processCount\":2},\"handoff\":{\"running\":true,\"handoffRootConfigured\":true,\"handoffRootReachable\":true,\"processCount\":3}}",
      ].join("\n"),
    });

    const report = await buildNasBridgeLifecycleReport("E:\\private\\repo", "start");

    expect(report).toContain("NAS Bridge Lifecycle");
    expect(report).toContain("action: start requested");
    expect(report).toContain("OK lifecycle command completed");
    expect(report).toContain("OK bridge ready: PC worker and NAS handoff are connected");
    expect(report).toContain("OK worker http: listening on configured port, processes 2");
    expect(report).toContain("OK handoff worker: running, NAS root reachable, processes 3");
    expect(report).not.toContain("8787");
    expect(report).not.toContain("secret");
    expect(report).not.toContain("private");
  });

  it("reports NAS bridge lifecycle failure without raw output", async () => {
    mocks.runLocalCommand.mockReset().mockResolvedValueOnce({
      exitCode: 1,
      timedOut: false,
      output: "raw failure E:\\private token=secret",
    });

    const report = await buildNasBridgeLifecycleReport("E:\\private\\repo", "stop");

    expect(report).toContain("FAIL lifecycle command failed");
    expect(report).toContain("FAIL worker http: status unavailable");
    expect(report).toContain("FAIL handoff worker: status unavailable");
    expect(report).not.toContain("raw failure");
    expect(report).not.toContain("secret");
    expect(report).not.toContain("private");
  });

  it("reports NAS bridge smoke failure without raw output", async () => {
    mocks.runLocalCommand.mockReset().mockResolvedValueOnce({
      exitCode: 1,
      timedOut: false,
      output: "raw failure E:\\private token=secret",
    });

    const report = await buildNasBridgeSmokeReport("E:\\private\\repo");

    expect(report).toContain("NAS Bridge Smoke");
    expect(report).toContain("FAIL smoke failed");
    expect(report).toContain("request=unknown");
    expect(report).toContain("check=unknown result=failed");
    expect(report).toContain("summary=smoke failed");
    expect(report).not.toContain("raw failure");
    expect(report).not.toContain("secret");
    expect(report).not.toContain("private");
  });

  it("reports NAS sync dry-run failure without raw output", async () => {
    mocks.runLocalCommand.mockReset().mockResolvedValueOnce({
      exitCode: 1,
      timedOut: false,
      output: "raw failure K:\\private token=secret",
    });

    const report = await buildNasSyncStatusReport("E:\\private\\repo");

    expect(report).toContain("NAS Sync Status");
    expect(report).toContain("FAIL NAS sync dry-run failed");
    expect(report).toContain("pending=unknown unchanged=unknown protected=unknown");
    expect(report).toContain("writes=disabled");
    expect(report).not.toContain("raw failure");
    expect(report).not.toContain("secret");
    expect(report).not.toContain("private");
  });

  it("reports NAS sync dry-run staging source freshness", async () => {
    mocks.runLocalCommand.mockReset().mockResolvedValueOnce({
      exitCode: 0,
      timedOut: false,
      output: [
        "noise before json token=secret",
        JSON.stringify({
          mode: "dry-run",
          stagingSource: {
            includeSource: true,
            status: "stale",
          },
          copiedOrReplaced: 0,
          skipped: 149,
          protectedSkipped: 6,
          removeBeforeCopy: true,
        }),
      ].join("\n"),
    });

    const report = await buildNasSyncStatusReport("E:\\private\\repo");

    expect(report).toContain("NAS Sync Status");
    expect(report).toContain("INFO NAS staging source is stale");
    expect(report).toContain("mode=dry-run");
    expect(report).toContain("staging-source=stale");
    expect(report).toContain("pending=0 unchanged=149 protected=6");
    expect(report).toContain("delete-before-copy=enabled");
    expect(report).toContain("writes=disabled");
    expect(report).not.toContain("secret");
    expect(report).not.toContain("private");
  });

  it("reports unavailable workers without leaking raw command output", async () => {
    mocks.runLocalCommand.mockReset()
      .mockResolvedValueOnce({ exitCode: 1, timedOut: false, output: "raw failure E:\\private" })
      .mockResolvedValueOnce({ exitCode: 1, timedOut: false, output: "raw failure token=secret" });
    mocks.existsSync.mockReturnValue(false);

    const report = await buildNasStatusReport("E:\\private\\repo");

    expect(report).toContain("FAIL worker http: status unavailable");
    expect(report).toContain("INFO bridge ready: not fully ready");
    expect(report).toContain("FAIL handoff worker: status unavailable");
    expect(report).toContain("INFO handoff mailbox: NAS root unavailable to bot process");
    expect(report).toContain("INFO result notifier: disabled");
    expect(report).toContain("OK request stale timeout: 15m");
    expect(report).toContain("INFO request tracking: channel unavailable");
    expect(report).not.toContain("raw failure");
    expect(report).not.toContain("secret");
    expect(report).not.toContain("private");
  });

  it("builds a public-safe NAS result report", () => {
    const report = buildNasResultsReport("E:\\private\\repo", "channel-1", 2);

    expect(report).toContain("NAS Handoff Results");
    expect(report).toContain("request-one");
    expect(report).toContain("check=plans status=completed summary=1/1 passed");
    expect(report).toContain("request-two");
    expect(report).toContain("check=tests status=failed summary=0/1 passed");
    expect(mocks.updateNasHandoffRequestResult).toHaveBeenCalledWith(
      "request-one",
      "completed",
      "1/1 passed",
      "2026-08-01T12:00:00.000Z",
    );
    expect(mocks.updateNasHandoffRequestResult).toHaveBeenCalledWith(
      "request-two",
      "failed",
      "0/1 passed",
      "2026-08-01T12:01:00.000Z",
    );
    expect(mocks.expireStaleNasHandoffRequests).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "channel-1",
    );
    expect(report).not.toContain("K:\\");
    expect(report).not.toContain("private");
  });

  it("keeps NAS result summaries compact and public-safe", () => {
    mocks.listNasHandoffRequests.mockReturnValue([{
      id: "request-long",
      check_name: "plans",
      status: "failed",
      result_summary: `failed at E:\\private\\repo ${"x".repeat(200)}`,
    }]);

    const report = buildNasResultsReport("E:\\private\\repo", "channel-1", 10);

    expect(report).toContain("NAS Handoff Results");
    expect(report).toContain("summary=failed at <local-path>");
    expect(report).not.toContain("private");
    expect(report).not.toContain("x".repeat(130));
    expect(report.length).toBeLessThan(700);
  });
});
