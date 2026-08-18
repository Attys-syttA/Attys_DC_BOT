import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  getConfig: vi.fn(),
  readPublicHandoffStore: vi.fn(),
  listHandoffEnvelopeFiles: vi.fn(),
  readHandoffEnvelope: vi.fn(),
  createAuditRequestHandoff: vi.fn(),
  createAuditJob: vi.fn(),
  findNasHandoffRequestsByIdPrefix: vi.fn(),
  getActiveAuditJobByProjectPath: vi.fn(),
  getProject: vi.fn(),
  insertAuditStepResult: vi.fn(),
  createNasHandoffRequest: vi.fn(),
  expireStaleNasHandoffRequests: vi.fn(),
  countNasHandoffRequestsByStatus: vi.fn(),
  getNasHandoffRequest: vi.fn(),
  listNasHandoffRequests: vi.fn(),
  listNasHandoffRequestsByStatus: vi.fn(),
  updateAuditJobProgress: vi.fn(),
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
  createAuditJob: mocks.createAuditJob,
  getProject: mocks.getProject,
  getActiveAuditJobByProjectPath: mocks.getActiveAuditJobByProjectPath,
  insertAuditStepResult: mocks.insertAuditStepResult,
  createNasHandoffRequest: mocks.createNasHandoffRequest,
  expireStaleNasHandoffRequests: mocks.expireStaleNasHandoffRequests,
  findNasHandoffRequestsByIdPrefix: mocks.findNasHandoffRequestsByIdPrefix,
  getNasHandoffRequest: mocks.getNasHandoffRequest,
  listNasHandoffRequests: mocks.listNasHandoffRequests,
  listNasHandoffRequestsByStatus: mocks.listNasHandoffRequestsByStatus,
  updateAuditJobProgress: mocks.updateAuditJobProgress,
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
  buildNasContainerStatusReport,
  buildNasDeployStatusReport,
  buildNasDoctorReport,
  buildNasMailboxReport,
  buildNasMailboxStatusReport,
  buildNasRequestStatusReport,
  buildNasRequestsReport,
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
    mocks.getActiveAuditJobByProjectPath.mockReturnValue(undefined);
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
    mocks.getProject.mockReturnValue({ channel_id: "channel-1", project_path: "E:\\codex_works\\Attys_DC_BOT", guild_id: "guild-1" });
    mocks.getNasHandoffRequest.mockReturnValue({
      id: "request-one",
      channel_id: "channel-1",
      project_label: "Attys_DC_BOT",
      check_name: "plans",
      status: "queued",
      result_summary: null,
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    });
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
    mocks.listNasHandoffRequestsByStatus.mockReturnValue([
      {
        id: "request-queued-one",
        check_name: "plans",
        status: "queued",
        result_summary: null,
        created_at: new Date(Date.now() - 8 * 60_000).toISOString(),
        updated_at: new Date(Date.now() - 3 * 60_000).toISOString(),
      },
    ]);
    mocks.findNasHandoffRequestsByIdPrefix.mockReturnValue([
      {
        id: "request-status-one",
        channel_id: "channel-1",
        project_label: "Attys_DC_BOT",
        check_name: "plans",
        status: "queued",
        result_summary: null,
        created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
        updated_at: new Date(Date.now() - 2 * 60_000).toISOString(),
      },
    ]);
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockImplementation((filePath: string) => {
      if (filePath.endsWith("NAS_STAGING_MANIFEST.json")) {
        return JSON.stringify({
          sourceCommit: "ebfa22a9abcd",
          packageVersion: "0.1.1-prerelease.2",
          includeSource: true,
        });
      }
      if (filePath.endsWith("NAS_BUILD_INFO.json")) {
        return JSON.stringify({
          sourceCommit: "ebfa22a9abcd",
          packageVersion: "0.1.1-prerelease.2",
          generatedAt: "2026-08-01T19:19:43Z",
          includeSource: true,
        });
      }
      if (filePath.endsWith("docker-compose.yml")) {
        return [
          "services:",
          "  attys-dc-bot-control-plane:",
          "    image: attys-dc-bot-control-plane:ebfa22a9abcd",
          "    labels:",
          "      attys.dc-bot.source-commit: \"ebfa22a9abcd\"",
          "      attys.dc-bot.package-version: \"0.1.1-prerelease.2\"",
          "",
        ].join("\n");
      }
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
          codexExecutionEnabled: false,
          workerHealth: [
            { workerId: "otthon", ok: true, statusCode: 200, summary: "worker health ready" },
          ],
          checkedAt: new Date().toISOString(),
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
      auditJobId: expect.any(String),
      projectLabel: "Attys_DC_BOT",
      checkName: "plans",
      status: "queued",
    }));
    expect(mocks.createAuditJob).toHaveBeenCalledWith(expect.objectContaining({
      channelId: "channel-1",
      projectLabel: "Attys_DC_BOT",
      mode: "check-only",
      status: "waiting_nas_result",
      currentStep: "plans",
    }));
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: expect.stringContaining("as audit job"),
    });
    expect(mocks.recordOperatorEvent).toHaveBeenCalledWith({
      kind: "task",
      status: "nas-request-queued",
      channelId: "channel-1",
    }, expect.any(String));
  });

  it("does not queue a NAS handoff request while an audit job is active", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_NAS_HANDOFF: true });
    mocks.getActiveAuditJobByProjectPath.mockReturnValue({
      id: "audit-job-active",
      status: "running_checks",
    });
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
      content: expect.stringContaining("An audit job is already active"),
    });
    expect(mocks.getActiveAuditJobByProjectPath).toHaveBeenCalledWith("guild-1", "E:\\codex_works\\Attys_DC_BOT");
    expect(mocks.writeHandoffEnvelope).not.toHaveBeenCalled();
    expect(mocks.createNasHandoffRequest).not.toHaveBeenCalled();
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

  it("keeps NAS deploy status disabled with the NAS status flag", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_NAS_STATUS: false });
    const interaction = {
      channelId: "channel-1",
      options: {
        getSubcommand: vi.fn(() => "deploy-status"),
      },
      editReply: vi.fn(),
    };

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "`/nas deploy-status` is disabled. Set `DISCORD_ENABLE_NAS_STATUS=true` in `.env` to enable it.",
    });
  });

  it("keeps NAS requests disabled with the NAS status flag", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_NAS_STATUS: false });
    const interaction = {
      channelId: "channel-1",
      options: {
        getSubcommand: vi.fn(() => "requests"),
      },
      editReply: vi.fn(),
    };

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "`/nas requests` is disabled. Set `DISCORD_ENABLE_NAS_STATUS=true` in `.env` to enable it.",
    });
    expect(mocks.listNasHandoffRequestsByStatus).not.toHaveBeenCalled();
  });

  it("keeps NAS request status disabled with the NAS status flag", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_NAS_STATUS: false });
    const interaction = {
      channelId: "channel-1",
      options: {
        getSubcommand: vi.fn(() => "request-status"),
        getString: vi.fn(() => "request-status-one"),
      },
      editReply: vi.fn(),
    };

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "`/nas request-status` is disabled. Set `DISCORD_ENABLE_NAS_STATUS=true` in `.env` to enable it.",
    });
    expect(mocks.findNasHandoffRequestsByIdPrefix).not.toHaveBeenCalled();
  });

  it("shows public-safe NAS deploy verification details when enabled", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_NAS_STATUS: true });
    const interaction = {
      channelId: "channel-1",
      options: {
        getSubcommand: vi.fn(() => "deploy-status"),
      },
      editReply: vi.fn(),
    };

    await execute(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("NAS Deploy Status");
    expect(content).toContain("OK deploy verified");
    expect(content).toContain("build=ebfa22a9abcd version=0.1.1-prerelease.2");
    expect(content).toContain("OK snapshot-build-match: snapshot matches staged build");
    expect(content).toContain("OK nas-codex-disabled: NAS-side Codex disabled");
    expect(content).not.toContain("K:\\");
    expect(content).not.toContain("private");
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
      ["run", "--silent", "nas:sync-share", "--", "-Json"],
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

  it("builds a public-safe NAS doctor report", async () => {
    mocks.runLocalCommand.mockReset()
      .mockResolvedValueOnce({
        exitCode: 0,
        timedOut: false,
        output: "{\"running\":true,\"listening\":true,\"port\":8787,\"processCount\":3,\"processIds\":[1,2,3]}",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        timedOut: false,
        output: "{\"running\":true,\"processCount\":2,\"processIds\":[4,5],\"handoffRootConfigured\":true,\"handoffRootReachable\":true}",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        timedOut: false,
        output: [
          "raw preface K:\\private token=secret",
          "{\"mode\":\"dry-run\",\"stagingSource\":{\"status\":\"fresh\"},\"copiedOrReplaced\":0,\"skipped\":160,\"protectedSkipped\":6,\"removeBeforeCopy\":true}",
        ].join("\n"),
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        timedOut: false,
        output: JSON.stringify({
          ok: true,
          action: "status",
          durationSec: 0.2,
          output: [
            "NAME IMAGE COMMAND SERVICE CREATED STATUS PORTS",
            "attys-dc-bot-control-plane attys-dc-bot-control-plane:ebfa22a9abcd command attys-dc-bot-control-plane now Up 2 minutes",
          ],
        }),
      });
    mocks.readHandoffEnvelope.mockReset();
    mocks.listHandoffEnvelopeFiles.mockReturnValue([]);

    const report = await buildNasDoctorReport("E:\\private\\repo", "channel-1");

    expect(report).toContain("NAS Doctor");
    expect(report).toContain("overall=ok");
    expect(report).toContain("OK bridge ready: PC worker and NAS handoff are connected");
    expect(report).toContain("OK NAS deploy verification: build=ebfa22a9abcd version=0.1.1-prerelease.2 checks=14/14");
    expect(report).toContain("OK NAS container: control-plane service is up, image=ebfa22a9abcd, duration 0.2s");
    expect(report).toContain("OK sync dry-run: staging-source=fresh pending=0 unchanged=160 protected=6");
    expect(report).toContain("root=ready");
    expect(report).toContain("tracked=queued:1 completed:2 failed:3");
    expect(report).toContain("writes=disabled");
    expect(report).not.toContain("K:\\");
    expect(report).not.toContain("secret");
    expect(report).not.toContain("private");
    expect(report).not.toContain("8787");
    expect(report).not.toContain("processIds");
    expect(mocks.runLocalCommand).toHaveBeenNthCalledWith(
      3,
      "npm.cmd",
      ["run", "--silent", "nas:sync-share", "--", "-Json"],
      expect.any(String),
      60_000,
    );
    expect(mocks.runLocalCommand).toHaveBeenNthCalledWith(
      4,
      "npm.cmd",
      ["run", "--silent", "nas:container:status", "--", "-Json"],
      expect.any(String),
      30_000,
    );
  });

  it("keeps NAS doctor public-safe when mailbox consistency lookup fails", async () => {
    mocks.runLocalCommand.mockReset()
      .mockResolvedValueOnce({
        exitCode: 0,
        timedOut: false,
        output: "{\"running\":true,\"listening\":true,\"processCount\":1}",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        timedOut: false,
        output: "{\"running\":true,\"processCount\":1,\"handoffRootReachable\":true}",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        timedOut: false,
        output: "{\"mode\":\"dry-run\",\"stagingSource\":{\"status\":\"fresh\"},\"copiedOrReplaced\":0,\"skipped\":160,\"protectedSkipped\":6}",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        timedOut: false,
        output: JSON.stringify({
          ok: true,
          durationSec: 0.3,
          output: ["attys-dc-bot-control-plane image command attys-dc-bot-control-plane now Up 3 minutes"],
        }),
      });
    mocks.countNasHandoffRequestsByStatus.mockImplementationOnce(() => {
      throw new Error("private K:\\secret token=hidden");
    });

    const report = await buildNasDoctorReport("E:\\private\\repo", "channel-1");

    expect(report).toContain("NAS Doctor");
    expect(report).toContain("overall=attention");
    expect(report).toContain("WARN mailbox consistency: unavailable");
    expect(report).toContain("writes=disabled");
    expect(report).not.toContain("K:\\");
    expect(report).not.toContain("secret");
    expect(report).not.toContain("token");
  });

  it("executes NAS doctor report when enabled", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_NAS_STATUS: true });
    mocks.runLocalCommand.mockReset()
      .mockResolvedValueOnce({
        exitCode: 0,
        timedOut: false,
        output: "{\"running\":true,\"listening\":true,\"processCount\":1}",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        timedOut: false,
        output: "{\"running\":true,\"processCount\":1,\"handoffRootReachable\":true}",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        timedOut: false,
        output: "{\"mode\":\"dry-run\",\"stagingSource\":{\"status\":\"fresh\"},\"copiedOrReplaced\":0,\"skipped\":160,\"protectedSkipped\":6}",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        timedOut: false,
        output: JSON.stringify({
          ok: true,
          durationSec: 0.3,
          output: ["attys-dc-bot-control-plane image command attys-dc-bot-control-plane now Up 3 minutes"],
        }),
      });
    mocks.readHandoffEnvelope.mockReset();
    mocks.listHandoffEnvelopeFiles.mockReturnValue([]);
    const interaction = {
      channelId: "channel-1",
      options: {
        getSubcommand: vi.fn(() => "doctor"),
      },
      editReply: vi.fn(),
    };

    await execute(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("NAS Doctor");
    expect(content).toContain("writes=disabled");
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
    expect(report).toContain("OK NAS control-plane snapshot: build=ebfa22a9abcd version=0.1.1-prerelease.2 handoff=ready checked=");
    expect(report).toContain("OK NAS deploy verification: build=ebfa22a9abcd version=0.1.1-prerelease.2 checks=14/14");
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

  it("builds a public-safe NAS deploy status report", () => {
    const report = buildNasDeployStatusReport("E:\\private\\repo");

    expect(report).toContain("NAS Deploy Status");
    expect(report).toContain("OK deploy verified");
    expect(report).toContain("checks=14/14");
    expect(report).not.toContain("K:\\");
    expect(report).not.toContain("private");
  });

  it("builds a public-safe NAS container status report", async () => {
    mocks.runLocalCommand.mockReset().mockResolvedValueOnce({
      exitCode: 0,
      timedOut: false,
      output: JSON.stringify({
        ok: true,
        action: "status",
        target: "<nas-ssh>",
        durationSec: 0.2,
        exitCode: 0,
        output: [
          "NAME IMAGE COMMAND SERVICE CREATED STATUS PORTS",
          "attys-dc-bot-control-plane attys-dc-bot-control-plane:ebfa22a9abcd command attys-dc-bot-control-plane now Up 2 minutes",
          "raw private K:\\secret token=hidden",
        ],
      }, null, 2),
    });

    const report = await buildNasContainerStatusReport("E:\\private\\repo");

    expect(report).toContain("NAS Container Status");
    expect(report).toContain("OK NAS container: control-plane service is up");
    expect(report).toContain("reachable=yes");
    expect(report).toContain("image=ebfa22a9abcd");
    expect(report).toContain("duration=0.2s");
    expect(report).toContain("remote-output-lines=3");
    expect(report).toContain("raw-output=hidden");
    expect(report).toContain("writes=disabled");
    expect(report).not.toContain("K:\\");
    expect(report).not.toContain("secret");
    expect(report).not.toContain("token");
  });

  it("reports NAS container status failure without raw output", async () => {
    mocks.runLocalCommand.mockReset().mockResolvedValueOnce({
      exitCode: 1,
      timedOut: false,
      output: "permission denied K:\\private token=secret",
    });

    const report = await buildNasContainerStatusReport("E:\\private\\repo");

    expect(report).toContain("NAS Container Status");
    expect(report).toContain("FAIL NAS container status unavailable");
    expect(report).toContain("reachable=no");
    expect(report).toContain("raw-output=hidden");
    expect(report).not.toContain("permission denied");
    expect(report).not.toContain("private");
    expect(report).not.toContain("secret");
  });

  it("reports NAS sync dry-run staging source freshness", async () => {
    mocks.runLocalCommand.mockReset().mockResolvedValueOnce({
      exitCode: 0,
      timedOut: false,
      output: [
        "NAS staging check passed: E:\\private\\repo",
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
        }, null, 2),
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
    mocks.getNasHandoffRequest.mockImplementation((requestId: string) => ({
      id: requestId,
      audit_job_id: `audit-${requestId}`,
      channel_id: "channel-1",
      project_label: "Attys_DC_BOT",
      check_name: requestId === "request-two" ? "tests" : "plans",
      status: "queued",
      result_summary: null,
      created_at: "2026-08-01T11:59:00.000Z",
      updated_at: "2026-08-01T11:59:00.000Z",
    }));

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
    expect(mocks.insertAuditStepResult).toHaveBeenCalledWith(
      "audit-request-one",
      expect.objectContaining({
        name: "plans",
        status: "passed",
        exitCode: 0,
        publicOutput: "1/1 passed",
      }),
    );
    expect(mocks.updateAuditJobProgress).toHaveBeenCalledWith(
      "audit-request-one",
      "completed",
      null,
      1,
      "2026-08-01T12:00:00.000Z",
    );
    expect(mocks.insertAuditStepResult).toHaveBeenCalledWith(
      "audit-request-two",
      expect.objectContaining({
        name: "tests",
        status: "failed",
        exitCode: 1,
        publicOutput: "0/1 passed",
      }),
    );
    expect(mocks.updateAuditJobProgress).toHaveBeenCalledWith(
      "audit-request-two",
      "waiting_manual_review",
      null,
      1,
      "2026-08-01T12:01:00.000Z",
    );
    expect(mocks.recordOperatorEvent).toHaveBeenCalledWith({
      kind: "task",
      status: "nas-result-completed",
      channelId: "channel-1",
    }, "E:\\private\\repo");
    expect(mocks.recordOperatorEvent).toHaveBeenCalledWith({
      kind: "task",
      status: "nas-result-failed",
      channelId: "channel-1",
    }, "E:\\private\\repo");
    expect(mocks.expireStaleNasHandoffRequests).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "channel-1",
    );
    expect(report).not.toContain("K:\\");
    expect(report).not.toContain("private");
  });

  it("does not re-record NAS results for already closed tracked requests", () => {
    mocks.getNasHandoffRequest.mockReturnValue({
      id: "request-one",
      channel_id: "channel-1",
      project_label: "Attys_DC_BOT",
      check_name: "plans",
      status: "completed",
      result_summary: "already done",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:02:00.000Z",
    });

    buildNasResultsReport("E:\\private\\repo", "channel-1", 2);

    expect(mocks.updateNasHandoffRequestResult).not.toHaveBeenCalled();
    expect(mocks.recordOperatorEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "nas-result-completed" }),
      expect.any(String),
    );
  });

  it("builds a public-safe tracked NAS request report", () => {
    mocks.listNasHandoffRequestsByStatus.mockReturnValue([
      {
        id: "request-visible-one",
        check_name: "plans",
        status: "queued",
        result_summary: null,
        created_at: "2026-08-01T19:00:00.000Z",
        updated_at: "2026-08-01T19:05:00.000Z",
      },
      {
        id: "request-visible-two",
        check_name: "tests",
        status: "failed",
        result_summary: "failed at K:\\data token=secret",
        created_at: "2026-08-01T18:00:00.000Z",
        updated_at: "2026-08-01T18:01:00.000Z",
      },
    ]);

    const report = buildNasRequestsReport("channel-1", "all", 10);

    expect(report).toContain("NAS Handoff Requests");
    expect(report).toContain("filter=all");
    expect(report).toContain("request request-visi");
    expect(report).toContain("check=plans status=queued");
    expect(report).toContain("summary=waiting");
    expect(report).toContain("check=tests status=failed");
    expect(report).toContain("summary=failed at <local-path> token=<redacted>");
    expect(mocks.expireStaleNasHandoffRequests).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "channel-1",
    );
    expect(mocks.listNasHandoffRequestsByStatus).toHaveBeenCalledWith("channel-1", "all", 10);
    expect(report).not.toContain("K:\\");
    expect(report).not.toContain("secret");
  });

  it("executes NAS requests with a status filter and limit", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_NAS_STATUS: true });
    mocks.readHandoffEnvelope.mockReset();
    mocks.listHandoffEnvelopeFiles.mockImplementation((_root: string, box: string) => {
      if (box === "inbox") return ["K:\\private\\handoff\\inbox\\request-queued-one.json"];
      return [];
    });
    mocks.readHandoffEnvelope.mockReturnValue({
      id: "request-queued-one",
      type: "audit.request",
      publicFields: { check: "plans" },
    });
    const interaction = {
      channelId: "channel-1",
      options: {
        getSubcommand: vi.fn(() => "requests"),
        getString: vi.fn(() => "queued"),
        getInteger: vi.fn(() => 3),
      },
      editReply: vi.fn(),
    };

    await execute(interaction as never);

    expect(mocks.listNasHandoffRequestsByStatus).toHaveBeenCalledWith("channel-1", "queued", 3);
    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("NAS Handoff Requests");
    expect(content).toContain("filter=queued");
    expect(content).toContain("mailbox=inbox");
    expect(content).not.toContain("K:\\");
  });

  it("builds a public-safe tracked NAS request status report", () => {
    mocks.findNasHandoffRequestsByIdPrefix.mockReturnValue([{
      id: "request-status-one",
      channel_id: "channel-1",
      project_label: "E:\\private\\Attys_DC_BOT",
      check_name: "plans",
      status: "failed",
      result_summary: "failed at K:\\data token=secret",
      created_at: "2026-08-01T18:00:00.000Z",
      updated_at: "2026-08-01T18:01:00.000Z",
    }]);

    const report = buildNasRequestStatusReport("channel-1", "request-status");

    expect(report).toContain("NAS Handoff Request");
    expect(report).toContain("request=request-status-one");
    expect(report).toContain("project=<local-path>");
    expect(report).toContain("check=plans");
    expect(report).toContain("status=failed");
    expect(report).toContain("summary=failed at <local-path> token=<redacted>");
    expect(mocks.findNasHandoffRequestsByIdPrefix).toHaveBeenCalledWith("channel-1", "request-status", 6);
    expect(report).not.toContain("K:\\");
    expect(report).not.toContain("secret");
  });

  it("builds a public-safe NAS handoff mailbox report", () => {
    mocks.readHandoffEnvelope.mockReset();
    mocks.listHandoffEnvelopeFiles.mockReturnValue([
      "K:\\private\\handoff\\outbox\\result-one.json",
      "K:\\private\\handoff\\outbox\\result-two.json",
    ]);
    mocks.readHandoffEnvelope
      .mockReturnValueOnce({
        id: "result-two",
        type: "audit.result",
        status: "failed",
        createdAt: new Date(Date.now() - 4 * 60_000).toISOString(),
        publicSummary: "Audit result failed at K:\\private token=secret",
        publicFields: {
          request: "request-two",
          check: "tests",
          summary: "failed at K:\\private token=secret",
        },
      })
      .mockReturnValueOnce({
        id: "result-one",
        type: "audit.result",
        status: "completed",
        createdAt: new Date(Date.now() - 10 * 60_000).toISOString(),
        publicSummary: "Audit result",
        publicFields: {
          request: "request-one",
          check: "plans",
          summary: "1/1 passed",
        },
      });

    const report = buildNasMailboxReport("E:\\private\\repo", "outbox", 2);

    expect(report).toContain("NAS Handoff Mailbox");
    expect(report).toContain("box=outbox");
    expect(report).toContain("invalid=0");
    expect(report).toContain("result-two type=audit.result status=failed check=tests request=request-two");
    expect(report).toContain("summary=failed at <local-path> token=<redacted>");
    expect(report).toContain("result-one type=audit.result status=completed check=plans request=request-one");
    expect(report).not.toContain("K:\\");
    expect(report).not.toContain("secret");
    expect(report).not.toContain("private");
  });

  it("reports unavailable NAS handoff mailbox safely", () => {
    mocks.existsSync.mockReturnValue(false);

    const report = buildNasMailboxReport("E:\\private\\repo", "inbox", 5);

    expect(report).toContain("box=inbox");
    expect(report).toContain("INFO handoff mailbox unavailable to bot process");
    expect(report).not.toContain("private");
  });

  it("executes NAS mailbox report with box and limit", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_NAS_STATUS: true });
    mocks.readHandoffEnvelope.mockReset();
    mocks.listHandoffEnvelopeFiles.mockReturnValue(["K:\\private\\handoff\\archive\\request-one.json"]);
    mocks.readHandoffEnvelope.mockReturnValue({
      id: "request-one",
      type: "audit.request",
      status: "queued",
      createdAt: new Date(Date.now() - 2 * 60_000).toISOString(),
      publicSummary: "Audit request",
      publicFields: { check: "plans" },
    });
    const interaction = {
      channelId: "channel-1",
      options: {
        getSubcommand: vi.fn(() => "mailbox"),
        getString: vi.fn(() => "archive"),
        getInteger: vi.fn(() => 1),
      },
      editReply: vi.fn(),
    };

    await execute(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("NAS Handoff Mailbox");
    expect(content).toContain("box=archive");
    expect(content).toContain("request-one type=audit.request status=queued");
    expect(content).not.toContain("K:\\");
  });

  it("builds a public-safe NAS handoff mailbox consistency status", () => {
    mocks.readHandoffEnvelope.mockReset();
    mocks.readPublicHandoffStore.mockReturnValue({
      rootStatus: "ready",
      boxes: [
        { box: "inbox", validMessages: 1, invalidMessages: 0 },
        { box: "outbox", validMessages: 2, invalidMessages: 1 },
        { box: "archive", validMessages: 1, invalidMessages: 0 },
      ],
    });
    mocks.listHandoffEnvelopeFiles.mockImplementation((_root: string, box: string) => {
      if (box === "outbox") {
        return [
          "K:\\private\\handoff\\outbox\\result-tracked.json",
          "K:\\private\\handoff\\outbox\\result-orphan.json",
        ];
      }
      if (box === "inbox") return ["K:\\private\\handoff\\inbox\\request-queued-one.json"];
      return [];
    });
    mocks.readHandoffEnvelope.mockImplementation((filePath: string) => {
      if (filePath.includes("result-tracked")) {
        return {
          id: "result-request-queued-one",
          type: "audit.result",
          status: "completed",
          createdAt: new Date().toISOString(),
          publicSummary: "Audit result",
          publicFields: { request: "request-queued-one", check: "plans" },
        };
      }
      if (filePath.includes("result-orphan")) {
        return {
          id: "result-orphan",
          type: "audit.result",
          status: "failed",
          createdAt: new Date().toISOString(),
          publicSummary: "raw K:\\private token=secret",
          publicFields: { request: "orphan-request", check: "tests" },
        };
      }
      return {
        id: "request-queued-one",
        type: "audit.request",
        status: "queued",
        createdAt: new Date().toISOString(),
        publicSummary: "Audit request",
        publicFields: { check: "plans" },
      };
    });
    mocks.getNasHandoffRequest.mockImplementation((requestId: string) => {
      if (requestId === "request-queued-one") {
        return {
          id: "request-queued-one",
          channel_id: "channel-1",
          project_label: "Attys_DC_BOT",
          check_name: "plans",
          status: "queued",
          result_summary: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
      return undefined;
    });

    const report = buildNasMailboxStatusReport("E:\\private\\repo", "channel-1");

    expect(report).toContain("NAS Handoff Mailbox Status");
    expect(report).toContain("root=ready");
    expect(report).toContain("boxes=inbox:1 outbox:2 archive:1");
    expect(report).toContain("invalid=inbox:0 outbox:1 archive:0");
    expect(report).toContain("tracked=queued:1 completed:2 failed:3");
    expect(report).toContain("pending-results=1");
    expect(report).toContain("orphan-results=1");
    expect(report).toContain("queued-missing=0");
    expect(report).not.toContain("K:\\");
    expect(report).not.toContain("secret");
    expect(report).not.toContain("private");
  });

  it("executes NAS mailbox status report when enabled", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_NAS_STATUS: true });
    mocks.readHandoffEnvelope.mockReset();
    mocks.listHandoffEnvelopeFiles.mockReturnValue([]);
    const interaction = {
      channelId: "channel-1",
      options: {
        getSubcommand: vi.fn(() => "mailbox-status"),
      },
      editReply: vi.fn(),
    };

    await execute(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("NAS Handoff Mailbox Status");
    expect(content).toContain("pending-results=0");
  });

  it("shows the matching NAS handoff mailbox box for a tracked request", () => {
    mocks.readHandoffEnvelope.mockReset();
    mocks.listHandoffEnvelopeFiles.mockImplementation((_root: string, box: string) => {
      if (box === "inbox") return ["K:\\private\\handoff\\inbox\\request-status-one.json"];
      return [];
    });
    mocks.readHandoffEnvelope.mockReturnValue({
      id: "request-status-one",
      type: "audit.request",
      publicFields: { check: "plans" },
    });

    const report = buildNasRequestStatusReport("channel-1", "request-status-one", "E:\\private\\repo");

    expect(report).toContain("mailbox=inbox");
    expect(report).not.toContain("K:\\");
    expect(report).not.toContain("private");
  });

  it("finds a tracked request result in the NAS handoff outbox", () => {
    mocks.readHandoffEnvelope.mockReset();
    mocks.listHandoffEnvelopeFiles.mockImplementation((_root: string, box: string) => {
      if (box === "outbox") return ["K:\\private\\handoff\\outbox\\result-request-status-one.json"];
      return [];
    });
    mocks.readHandoffEnvelope.mockReturnValue({
      id: "result-request-status-one",
      type: "audit.result",
      publicFields: { request: "request-status-one", result: "passed" },
    });

    const report = buildNasRequestStatusReport("channel-1", "request-status-one", "E:\\private\\repo");

    expect(report).toContain("mailbox=outbox");
    expect(report).not.toContain("K:\\");
    expect(report).not.toContain("private");
  });

  it("reports unavailable or invalid NAS handoff mailbox lookup safely", () => {
    mocks.existsSync.mockReturnValueOnce(false);
    mocks.readHandoffEnvelope.mockReset();
    expect(buildNasRequestStatusReport("channel-1", "request-status-one", "E:\\private\\repo"))
      .toContain("mailbox=unavailable");

    mocks.existsSync.mockReturnValue(true);
    mocks.listHandoffEnvelopeFiles.mockReturnValue(["K:\\private\\handoff\\inbox\\broken.json"]);
    mocks.readHandoffEnvelope.mockImplementation(() => {
      throw new Error("raw parse failure token=secret");
    });

    const report = buildNasRequestStatusReport("channel-1", "request-status-one", "E:\\private\\repo");

    expect(report).toContain("mailbox=invalid");
    expect(report).not.toContain("raw parse failure");
    expect(report).not.toContain("secret");
    expect(report).not.toContain("private");
  });

  it("handles ambiguous NAS request status prefixes without guessing", () => {
    mocks.findNasHandoffRequestsByIdPrefix.mockReturnValue([
      {
        id: "request-status-one",
        channel_id: "channel-1",
        project_label: "Attys_DC_BOT",
        check_name: "plans",
        status: "queued",
        result_summary: null,
        created_at: "2026-08-01T18:00:00.000Z",
        updated_at: "2026-08-01T18:00:00.000Z",
      },
      {
        id: "request-status-two",
        channel_id: "channel-1",
        project_label: "Attys_DC_BOT",
        check_name: "tests",
        status: "completed",
        result_summary: "1/1 passed",
        created_at: "2026-08-01T18:00:00.000Z",
        updated_at: "2026-08-01T18:02:00.000Z",
      },
    ]);

    const report = buildNasRequestStatusReport("channel-1", "request-status");

    expect(report).toContain("INFO request prefix is ambiguous");
    expect(report).toContain("request-status-one status=queued");
    expect(report).toContain("request-status-two status=completed");
  });

  it("executes NAS request status with a request id prefix", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_NAS_STATUS: true });
    const interaction = {
      channelId: "channel-1",
      options: {
        getSubcommand: vi.fn(() => "request-status"),
        getString: vi.fn(() => "request-status-one"),
      },
      editReply: vi.fn(),
    };

    await execute(interaction as never);

    expect(mocks.findNasHandoffRequestsByIdPrefix).toHaveBeenCalledWith("channel-1", "request-status-one", 6);
    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("NAS Handoff Request");
    expect(content).toContain("request=request-status-one");
    expect(content).toContain("mailbox=");
  });

  it("shows the read-only NAS handoff gate report", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_NAS_STATUS: true });
    const interaction = {
      channelId: "channel-1",
      options: {
        getSubcommand: vi.fn(() => "handoff-gate"),
      },
      editReply: vi.fn(),
    };

    await execute(interaction as never);

    const content = interaction.editReply.mock.calls[0][0].content;
    expect(content).toContain("**NAS Handoff Gate**");
    expect(content).toContain("status: ready");
    expect(content).toContain("OK source publication checkpoint");
    expect(content).toContain("OK security boundary review");
    expect(content).toContain("OK shared vs NAS-specific split");
    expect(content).toContain("OK unified NAS/BotOps plan");
    expect(content).toContain("OK remote boundary approval");
    expect(content).toContain("approval-gated actions: NAS source/share writes, remote execution changes, deploy, rebuild, restart");
  });

  it("keeps the NAS handoff gate behind the NAS status flag", async () => {
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_NAS_STATUS: false });
    const interaction = {
      options: {
        getSubcommand: vi.fn(() => "handoff-gate"),
      },
      editReply: vi.fn(),
    };

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "`/nas handoff-gate` is disabled. Set `DISCORD_ENABLE_NAS_STATUS=true` in `.env` to enable it.",
    });
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
