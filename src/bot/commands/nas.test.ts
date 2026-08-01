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
  getNasHandoffRequest: vi.fn(),
  listNasHandoffRequests: vi.fn(),
  updateNasHandoffRequestResult: vi.fn(),
  writeHandoffEnvelope: vi.fn(),
  runLocalCommand: vi.fn(),
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
  getProject: mocks.getProject,
  createNasHandoffRequest: mocks.createNasHandoffRequest,
  getNasHandoffRequest: mocks.getNasHandoffRequest,
  listNasHandoffRequests: mocks.listNasHandoffRequests,
  updateNasHandoffRequestResult: mocks.updateNasHandoffRequestResult,
}));

vi.mock("./local-command.js", () => ({
  npmCommand: () => "npm.cmd",
  runLocalCommand: mocks.runLocalCommand,
}));

import { buildNasResultsReport, buildNasStatusReport, execute } from "./nas.js";

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
    mocks.getConfig.mockReturnValue({ DISCORD_ENABLE_NAS_STATUS: true });
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
    mocks.readFileSync.mockReturnValue("ATTYS_NAS_HANDOFF_ROOT=K:\\data\\handoff\nATTYS_WORKER_SHARED_SECRET_HOME=hidden\n");
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
    const report = await buildNasStatusReport("E:\\private\\repo");

    expect(report).toContain("NAS Bridge Status");
    expect(report).toContain("OK bridge ready: PC worker and NAS handoff are connected");
    expect(report).toContain("OK worker http: listening on configured port, processes 3");
    expect(report).toContain("OK handoff worker: running, NAS root reachable, processes 3");
    expect(report).toContain("OK handoff mailbox: inbox:0 outbox:2 archive:2");
    expect(report).not.toContain("8787");
    expect(report).not.toContain("processIds");
    expect(report).not.toContain("K:\\");
    expect(report).not.toContain("hidden");
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
    expect(report).not.toContain("K:\\");
    expect(report).not.toContain("private");
  });
});
