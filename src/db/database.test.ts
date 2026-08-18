import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock better-sqlite3 to always use :memory:
vi.mock("better-sqlite3", async () => {
  const actual = await vi.importActual("better-sqlite3") as any;
  const RealDatabase = actual.default;
  return {
    default: function MemoryDatabase(_path: string, options?: object) {
      return new RealDatabase(":memory:", options);
    },
  };
});

import {
  initDatabase,
  registerProject,
  unregisterProject,
  getProject,
  getAllProjects,
  getProjectsByPath,
  setAutoApprove,
  upsertSession,
  getSession,
  updateSessionStatus,
  getAllSessions,
  createAuditJob,
  getActiveAuditJob,
  getActiveAuditJobByProjectPath,
  getAuditJob,
  getLatestAuditJob,
  normalizeInterruptedAuditJobs,
  updateAuditJobProgress,
  requestAuditJobStop,
  insertAuditStepResult,
  listAuditSteps,
  createAuditRepairExecution,
  createAuditRepairWorktree,
  getAuditRepairExecution,
  getAuditRepairWorktree,
  listAuditRepairExecutions,
  updateAuditRepairExecutionResult,
  updateAuditRepairWorktreeStatus,
  createNasHandoffRequest,
  countNasHandoffRequestsByStatus,
  expireStaleNasHandoffRequests,
  findNasHandoffRequestsByIdPrefix,
  getNasHandoffRequest,
  listNasHandoffRequests,
  listNasHandoffRequestsByStatus,
  updateNasHandoffRequestResult,
  createOrGetBotOpsJob,
  getBotOpsJob,
  listBotOpsJobs,
  approveBotOpsJob,
  acquireNextBotOpsJob,
  markExpiredBotOpsApprovals,
  markExpiredBotOpsLeases,
  recoverBotOpsWaitingWorkerJob,
  recordBotOpsHeartbeat,
  completeBotOpsJob,
  updateBotOpsJobStatus,
  listBotOpsJobEvents,
  recordBotOpsWorkerHeartbeat,
  listBotOpsWorkerHeartbeats,
} from "./database.js";
import { defaultAuditCapabilities } from "../audit/types.js";

describe("database", () => {
  beforeEach(() => {
    initDatabase();
  });

  // ─── Project CRUD ───

  describe("project CRUD", () => {
    it("registerProject + getProject", () => {
      registerProject("ch1", "/path/to/project", "guild1");
      const project = getProject("ch1");
      expect(project).toBeDefined();
      expect(project!.project_path).toBe("/path/to/project");
      expect(project!.guild_id).toBe("guild1");
      expect(project!.auto_approve).toBe(0);
    });

    it("registerProject with same channelId replaces existing", () => {
      registerProject("ch1", "/old/path", "guild1");
      registerProject("ch1", "/new/path", "guild1");
      const project = getProject("ch1");
      expect(project!.project_path).toBe("/new/path");
    });

    it("getProject returns undefined for non-existent channel", () => {
      expect(getProject("nonexistent")).toBeUndefined();
    });

    it("getAllProjects filters by guild", () => {
      registerProject("ch1", "/p1", "guild1");
      registerProject("ch2", "/p2", "guild1");
      registerProject("ch3", "/p3", "guild2");
      expect(getAllProjects("guild1")).toHaveLength(2);
      expect(getAllProjects("guild2")).toHaveLength(1);
      expect(getAllProjects("guild3")).toHaveLength(0);
    });

    it("getProjectsByPath finds duplicate channel mappings for one project", () => {
      registerProject("ch1", "/p1", "guild1");
      registerProject("ch2", "/p1", "guild1");
      registerProject("ch3", "/p1", "guild2");
      registerProject("ch4", "/p2", "guild1");

      const projects = getProjectsByPath("guild1", "/p1");
      expect(projects.map((project) => project.channel_id).sort()).toEqual(["ch1", "ch2"]);
    });

    it("unregisterProject removes project and cascades to sessions", () => {
      registerProject("ch1", "/p1", "guild1");
      upsertSession("s1", "ch1", null, "online");
      unregisterProject("ch1");
      expect(getProject("ch1")).toBeUndefined();
      expect(getSession("ch1")).toBeUndefined();
    });

    it("setAutoApprove toggles auto_approve flag", () => {
      registerProject("ch1", "/p1", "guild1");
      expect(getProject("ch1")!.auto_approve).toBe(0);

      setAutoApprove("ch1", true);
      expect(getProject("ch1")!.auto_approve).toBe(1);

      setAutoApprove("ch1", false);
      expect(getProject("ch1")!.auto_approve).toBe(0);
    });
  });

  // ─── Session CRUD ───

  describe("session CRUD", () => {
    beforeEach(() => {
      registerProject("ch1", "/p1", "guild1");
    });

    it("upsertSession + getSession", () => {
      upsertSession("s1", "ch1", "sdk-session-1", "online");
      const session = getSession("ch1");
      expect(session).toBeDefined();
      expect(session!.session_id).toBe("sdk-session-1");
      expect(session!.status).toBe("online");
    });

    it("upsertSession replaces existing session with same id", () => {
      upsertSession("s1", "ch1", null, "online");
      upsertSession("s1", "ch1", "sdk-1", "idle");
      const session = getSession("ch1");
      expect(session!.session_id).toBe("sdk-1");
      expect(session!.status).toBe("idle");
    });

    it("upsertSession with null sessionId", () => {
      upsertSession("s1", "ch1", null, "online");
      const session = getSession("ch1");
      expect(session!.session_id).toBeNull();
    });

    it("updateSessionStatus changes status", () => {
      upsertSession("s1", "ch1", null, "online");
      updateSessionStatus("ch1", "waiting");
      expect(getSession("ch1")!.status).toBe("waiting");
    });

    it("getAllSessions joins with projects", () => {
      registerProject("ch2", "/p2", "guild1");
      upsertSession("s1", "ch1", null, "online");
      upsertSession("s2", "ch2", null, "idle");
      const sessions = getAllSessions("guild1");
      expect(sessions).toHaveLength(2);
      expect(sessions[0].project_path).toBeDefined();
    });

    it("getAllSessions returns empty for guild with no sessions", () => {
      registerProject("ch2", "/p2", "guild2");
      expect(getAllSessions("guild2")).toHaveLength(0);
    });
  });

  describe("BotOps jobs", () => {
    it("creates BotOps jobs idempotently by job id", () => {
      const first = createOrGetBotOpsJob({
        job_id: "job-1",
        requested_by: "operator",
        target: "nas",
        capability: "nas.worker.check",
        summary: "worker check",
      });
      const second = createOrGetBotOpsJob({
        job_id: "job-1",
        requested_by: "operator",
        target: "nas",
        capability: "nas.worker.check",
        summary: "worker check",
      });

      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(listBotOpsJobs()).toHaveLength(1);
      expect(getBotOpsJob("job-1")?.status).toBe("Requested");
      expect(listBotOpsJobEvents("job-1")).toMatchObject([
        {
          event_type: "job.created",
          actor: "operator",
          detail: "nas/nas.worker.check",
        },
      ]);
    });

    it("requires approval before approval-gated jobs become requested", () => {
      createOrGetBotOpsJob({
        job_id: "restart-1",
        requested_by: "operator",
        target: "windows",
        capability: "service.restart",
        summary: "restart",
      });

      expect(getBotOpsJob("restart-1")?.status).toBe("WaitingApproval");
      const approved = approveBotOpsJob("restart-1", "operator", new Date("2026-08-18T10:00:00.000Z"));
      expect(approved?.approval_state).toBe("approved");
      expect(approved?.approved_by).toBe("operator");
      expect(approved?.approval_expires_at).toBe("2026-08-18T10:15:00.000Z");
      expect(getBotOpsJob("restart-1")?.status).toBe("Requested");
      expect(listBotOpsJobEvents("restart-1")[0]).toMatchObject({
        event_type: "approval.approved",
        actor: "operator",
        detail: "expires 2026-08-18T10:15:00.000Z",
      });
    });

    it("can cancel a queued job without deleting its audit trail", () => {
      createOrGetBotOpsJob({
        job_id: "check-1",
        requested_by: "operator",
        target: "repo",
        capability: "audit.check",
        summary: "check",
      });

      expect(updateBotOpsJobStatus("check-1", "Cancelled", "cancelled by test")).toBe(true);
      expect(getBotOpsJob("check-1")?.status).toBe("Cancelled");
      expect(getBotOpsJob("check-1")?.result).toBe("cancelled by test");
      expect(listBotOpsJobEvents("check-1")[0]).toMatchObject({
        event_type: "status.Cancelled",
        actor: "system",
        detail: "cancelled by test",
      });
    });

    it("acquires only requested jobs matching target and capability", () => {
      createOrGetBotOpsJob({
        job_id: "windows-1",
        requested_by: "operator",
        target: "windows",
        capability: "status.read",
        summary: "windows status",
      });
      createOrGetBotOpsJob({
        job_id: "nas-1",
        requested_by: "operator",
        target: "nas",
        capability: "nas.worker.check",
        summary: "worker check",
      });

      const job = acquireNextBotOpsJob(
        "nas-worker-1",
        "nas",
        ["nas.worker.check"],
        30_000,
        new Date("2026-08-18T10:00:00.000Z"),
      );

      expect(job?.job_id).toBe("nas-1");
      expect(job?.status).toBe("Running");
      expect(job?.lease_owner).toBe("nas-worker-1");
      expect(getBotOpsJob("windows-1")?.status).toBe("Requested");
    });

    it("marks expired approvals stale before worker pickup", () => {
      createOrGetBotOpsJob({
        job_id: "deploy-2",
        requested_by: "operator",
        target: "nas",
        capability: "nas.deploy.verify",
        summary: "deploy verify",
      });
      approveBotOpsJob("deploy-2", "operator", new Date("2026-08-18T10:00:00.000Z"), 1_000);

      expect(acquireNextBotOpsJob(
        "nas-worker-1",
        "nas",
        ["nas.deploy.verify"],
        30_000,
        new Date("2026-08-18T10:00:02.000Z"),
      )).toBeUndefined();

      const job = getBotOpsJob("deploy-2");
      expect(job?.approval_state).toBe("stale");
      expect(job?.status).toBe("WaitingApproval");
      expect(job?.result).toBe("approval expired");
      expect(listBotOpsJobEvents("deploy-2")[0]).toMatchObject({
        event_type: "approval.stale",
        actor: "system",
        detail: "approval expired",
      });
    });

    it("can mark expired approvals in a maintenance pass", () => {
      createOrGetBotOpsJob({
        job_id: "push-1",
        requested_by: "operator",
        target: "repo",
        capability: "git.push",
        summary: "push",
      });
      approveBotOpsJob("push-1", "operator", new Date("2026-08-18T10:00:00.000Z"), 1_000);

      expect(markExpiredBotOpsApprovals(new Date("2026-08-18T10:00:02.000Z"))).toBe(1);
      expect(getBotOpsJob("push-1")?.approval_state).toBe("stale");
    });

    it("records heartbeat and completion only for the lease owner", () => {
      createOrGetBotOpsJob({
        job_id: "nas-2",
        requested_by: "operator",
        target: "nas",
        capability: "nas.worker.check",
        summary: "worker check",
      });
      acquireNextBotOpsJob("nas-worker-1", "nas", ["nas.worker.check"], 30_000);

      expect(recordBotOpsHeartbeat("nas-2", "other-worker")).toBe(false);
      expect(recordBotOpsHeartbeat("nas-2", "nas-worker-1", new Date("2026-08-18T10:00:01.000Z"))).toBe(true);
      expect(completeBotOpsJob("nas-2", "other-worker", "Completed", "wrong owner")).toBe(false);
      expect(completeBotOpsJob("nas-2", "nas-worker-1", "Completed", "ok")).toBe(true);
      expect(getBotOpsJob("nas-2")?.status).toBe("Completed");
      expect(getBotOpsJob("nas-2")?.lease_owner).toBeNull();
      expect(listBotOpsJobEvents("nas-2").map((event) => event.event_type)).toEqual([
        "worker.Completed",
        "worker.acquired",
        "job.created",
      ]);
    });

    it("fails closed after a worker lease expires", () => {
      createOrGetBotOpsJob({
        job_id: "lease-expired-1",
        requested_by: "operator",
        target: "nas",
        capability: "nas.worker.check",
        summary: "worker check",
      });
      acquireNextBotOpsJob(
        "nas-worker-1",
        "nas",
        ["nas.worker.check"],
        1_000,
        new Date("2026-08-18T10:00:00.000Z"),
      );

      expect(recordBotOpsHeartbeat(
        "lease-expired-1",
        "nas-worker-1",
        new Date("2026-08-18T10:00:02.000Z"),
      )).toBe(false);
      expect(completeBotOpsJob(
        "lease-expired-1",
        "nas-worker-1",
        "Completed",
        "late completion",
        new Date("2026-08-18T10:00:02.000Z"),
      )).toBe(false);

      expect(markExpiredBotOpsLeases(new Date("2026-08-18T10:00:02.000Z"))).toBe(1);
      const job = getBotOpsJob("lease-expired-1");
      expect(job?.status).toBe("WaitingWorker");
      expect(job?.result).toBe("worker lease expired");
      expect(job?.lease_owner).toBeNull();
      expect(job?.lease_expires_at).toBeNull();
      expect(listBotOpsJobEvents("lease-expired-1")[0]).toMatchObject({
        event_type: "worker.lease_expired",
        actor: "nas-worker-1",
        detail: "worker lease expired",
      });
    });

    it("recovers only lease-expired WaitingWorker jobs without starting execution", () => {
      createOrGetBotOpsJob({
        job_id: "recover-1",
        requested_by: "operator",
        target: "nas",
        capability: "nas.worker.check",
        summary: "worker check",
      });
      acquireNextBotOpsJob(
        "nas-worker-1",
        "nas",
        ["nas.worker.check"],
        1_000,
        new Date("2026-08-18T10:00:00.000Z"),
      );
      markExpiredBotOpsLeases(new Date("2026-08-18T10:00:02.000Z"));

      const recovery = recoverBotOpsWaitingWorkerJob(
        "recover-1",
        "operator",
        new Date("2026-08-18T10:00:03.000Z"),
      );

      expect(recovery).toMatchObject({ recovered: true, reason: "recovered" });
      expect(getBotOpsJob("recover-1")).toMatchObject({
        status: "Requested",
        result: "requeued after worker lease expiry",
        lease_owner: null,
        lease_expires_at: null,
        heartbeat_at: null,
      });
      expect(listBotOpsJobEvents("recover-1")[0]).toMatchObject({
        event_type: "worker.recovered",
        actor: "operator",
        detail: "requeued after worker lease expiry",
      });
    });

    it("does not recover non-expired WaitingWorker jobs", () => {
      createOrGetBotOpsJob({
        job_id: "recover-wrong-result",
        requested_by: "operator",
        target: "nas",
        capability: "nas.worker.check",
        summary: "worker check",
      });
      updateBotOpsJobStatus("recover-wrong-result", "WaitingWorker", "waiting for worker");

      const recovery = recoverBotOpsWaitingWorkerJob("recover-wrong-result", "operator");

      expect(recovery).toMatchObject({ recovered: false, reason: "not_lease_expired" });
      expect(getBotOpsJob("recover-wrong-result")).toMatchObject({
        status: "WaitingWorker",
        result: "waiting for worker",
      });
    });

    it("requires a fresh approval when recovering an approval-gated expired lease", () => {
      createOrGetBotOpsJob({
        job_id: "recover-stale-approval",
        requested_by: "operator",
        target: "windows",
        capability: "service.restart",
        summary: "restart",
      });
      approveBotOpsJob(
        "recover-stale-approval",
        "operator",
        new Date("2026-08-18T10:00:00.000Z"),
        1_000,
      );
      acquireNextBotOpsJob(
        "windows-worker-1",
        "windows",
        ["service.restart"],
        1_000,
        new Date("2026-08-18T10:00:00.500Z"),
      );
      markExpiredBotOpsLeases(new Date("2026-08-18T10:00:02.000Z"));

      const recovery = recoverBotOpsWaitingWorkerJob(
        "recover-stale-approval",
        "operator",
        new Date("2026-08-18T10:00:02.000Z"),
      );

      expect(recovery).toMatchObject({ recovered: false, reason: "approval_stale" });
      expect(getBotOpsJob("recover-stale-approval")).toMatchObject({
        status: "WaitingApproval",
        approval_state: "stale",
        result: "approval expired during recovery",
      });
      expect(listBotOpsJobEvents("recover-stale-approval")[0]).toMatchObject({
        event_type: "approval.stale",
        actor: "operator",
        detail: "approval expired during recovery",
      });
    });

    it("records worker heartbeat snapshots by worker id", () => {
      recordBotOpsWorkerHeartbeat({
        worker_id: "nas-worker-1",
        target: "nas",
        host: "host-a",
        capabilities: ["nas.worker.check"],
        status: "status",
        detail: "first",
        now: new Date("2026-08-18T10:00:00.000Z"),
      });
      recordBotOpsWorkerHeartbeat({
        worker_id: "nas-worker-1",
        target: "nas",
        host: "host-a",
        capabilities: ["nas.worker.check"],
        status: "idle",
        detail: "second",
        now: new Date("2026-08-18T10:01:00.000Z"),
      });

      expect(listBotOpsWorkerHeartbeats("windows")).toHaveLength(0);
      expect(listBotOpsWorkerHeartbeats("nas")).toMatchObject([
        {
          worker_id: "nas-worker-1",
          target: "nas",
          host: "host-a",
          capabilities: "nas.worker.check",
          status: "idle",
          detail: "second",
          heartbeat_at: "2026-08-18T10:01:00.000Z",
        },
      ]);
    });
  });

  describe("audit job store", () => {
    beforeEach(() => {
      registerProject("ch1", "/p1", "guild1");
    });

    it("creates audit jobs with public-safe project labels", () => {
      createAuditJob({
        id: "audit-1",
        channelId: "ch1",
        projectLabel: "E:\\codex_works\\private-project",
        mode: "check-only",
        status: "queued",
        currentStep: null,
        iteration: 0,
        maxIterations: 2,
        stopRequested: false,
        capabilities: defaultAuditCapabilities("check-only"),
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
      });

      const job = getAuditJob("audit-1");
      expect(job).toMatchObject({
        id: "audit-1",
        channel_id: "ch1",
        project_label: "<local-path>/private-project",
        mode: "check-only",
        status: "queued",
        requested_check: null,
        current_step: null,
        iteration: 0,
        max_iterations: 2,
        stop_requested: 0,
      });
      expect(job!.capabilities_json).toContain("read-context");
      expect(getLatestAuditJob("ch1")!.id).toBe("audit-1");
      expect(getActiveAuditJob("ch1")!.id).toBe("audit-1");
    });

    it("updates audit progress and stop requests without touching sessions", () => {
      upsertSession("s1", "ch1", null, "idle");
      createAuditJob({
        id: "audit-1",
        channelId: "ch1",
        projectLabel: "/p1",
        mode: "check-only",
        status: "queued",
        currentStep: null,
        iteration: 0,
        maxIterations: 2,
        stopRequested: false,
        capabilities: defaultAuditCapabilities("check-only"),
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
      });

      updateAuditJobProgress(
        "audit-1",
        "running_checks",
        "tests",
        1,
        "2026-08-01T12:00:10.000Z",
      );
      requestAuditJobStop("audit-1", "2026-08-01T12:00:20.000Z");

      const job = getAuditJob("audit-1");
      expect(job).toMatchObject({
        status: "running_checks",
        current_step: "tests",
        iteration: 1,
        stop_requested: 1,
        updated_at: "2026-08-01T12:00:20.000Z",
      });
      expect(getSession("ch1")!.status).toBe("idle");
    });

    it("stores the requested named check separately from the current step", () => {
      createAuditJob({
        id: "audit-1",
        channelId: "ch1",
        projectLabel: "/p1",
        mode: "check-only",
        status: "running_checks",
        requestedCheck: "full",
        currentStep: "tests",
        iteration: 0,
        maxIterations: 2,
        stopRequested: false,
        capabilities: defaultAuditCapabilities("check-only"),
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
      });

      updateAuditJobProgress("audit-1", "waiting_manual_review", null, 0, "2026-08-01T12:01:00.000Z");

      expect(getAuditJob("audit-1")).toMatchObject({
        requested_check: "full",
        current_step: null,
      });
    });

    it("does not return terminal audit jobs as active", () => {
      createAuditJob({
        id: "audit-1",
        channelId: "ch1",
        projectLabel: "/p1",
        mode: "check-only",
        status: "completed",
        currentStep: null,
        iteration: 0,
        maxIterations: 2,
        stopRequested: false,
        capabilities: defaultAuditCapabilities("check-only"),
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
      });

      expect(getLatestAuditJob("ch1")!.id).toBe("audit-1");
      expect(getActiveAuditJob("ch1")).toBeUndefined();
    });

    it("finds active audit jobs by exact project path within one guild", () => {
      registerProject("ch2", "/p1", "guild1");
      registerProject("ch3", "/p1", "guild2");
      createAuditJob({
        id: "audit-other-channel",
        channelId: "ch2",
        projectLabel: "/p1",
        mode: "check-only",
        status: "waiting_nas_result",
        currentStep: "plans",
        iteration: 0,
        maxIterations: 1,
        stopRequested: false,
        capabilities: defaultAuditCapabilities("check-only"),
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
      });
      createAuditJob({
        id: "audit-other-guild",
        channelId: "ch3",
        projectLabel: "/p1",
        mode: "check-only",
        status: "waiting_nas_result",
        currentStep: "plans",
        iteration: 0,
        maxIterations: 1,
        stopRequested: false,
        capabilities: defaultAuditCapabilities("check-only"),
        createdAt: "2026-08-01T12:00:01.000Z",
        updatedAt: "2026-08-01T12:00:01.000Z",
      });

      expect(getActiveAuditJobByProjectPath("guild1", "/p1")!.id).toBe("audit-other-channel");
      expect(getActiveAuditJobByProjectPath("guild1", "/missing")).toBeUndefined();
    });

    it("normalizes process-like interrupted jobs to failed on startup recovery", () => {
      createAuditJob({
        id: "audit-1",
        channelId: "ch1",
        projectLabel: "/p1",
        mode: "check-only",
        status: "running_checks",
        currentStep: "tests",
        iteration: 0,
        maxIterations: 2,
        stopRequested: false,
        capabilities: defaultAuditCapabilities("check-only"),
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
      });

      expect(normalizeInterruptedAuditJobs(new Date("2026-08-01T12:05:00.000Z"))).toBe(1);
      expect(getAuditJob("audit-1")).toMatchObject({
        status: "failed",
        current_step: null,
        updated_at: "2026-08-01T12:05:00.000Z",
      });
      expect(getActiveAuditJob("ch1")).toBeUndefined();
    });

    it("does not normalize manual-review audit jobs", () => {
      createAuditJob({
        id: "audit-1",
        channelId: "ch1",
        projectLabel: "/p1",
        mode: "check-only",
        status: "waiting_manual_review",
        currentStep: null,
        iteration: 0,
        maxIterations: 2,
        stopRequested: false,
        capabilities: defaultAuditCapabilities("check-only"),
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
      });

      expect(normalizeInterruptedAuditJobs(new Date("2026-08-01T12:05:00.000Z"))).toBe(0);
      expect(getAuditJob("audit-1")).toMatchObject({
        status: "waiting_manual_review",
        updated_at: "2026-08-01T12:00:00.000Z",
      });
    });

    it("does not normalize NAS-waiting audit jobs", () => {
      createAuditJob({
        id: "audit-1",
        channelId: "ch1",
        projectLabel: "/p1",
        mode: "check-only",
        status: "waiting_nas_result",
        currentStep: "plans",
        iteration: 0,
        maxIterations: 1,
        stopRequested: false,
        capabilities: defaultAuditCapabilities("check-only"),
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
      });

      expect(normalizeInterruptedAuditJobs(new Date("2026-08-01T12:05:00.000Z"))).toBe(0);
      expect(getAuditJob("audit-1")).toMatchObject({
        status: "waiting_nas_result",
        current_step: "plans",
        updated_at: "2026-08-01T12:00:00.000Z",
      });
      expect(getActiveAuditJob("ch1")!.id).toBe("audit-1");
    });

    it("stores only public-safe audit step output", () => {
      createAuditJob({
        id: "audit-1",
        channelId: "ch1",
        projectLabel: "/p1",
        mode: "check-only",
        status: "running_checks",
        currentStep: "tests",
        iteration: 0,
        maxIterations: 2,
        stopRequested: false,
        capabilities: defaultAuditCapabilities("check-only"),
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
      });

      const stepId = insertAuditStepResult("audit-1", {
        name: "tests",
        status: "failed",
        exitCode: 1,
        timedOut: false,
        stopped: false,
        publicOutput: "DISCORD_BOT_TOKEN=abcdefghijklmnopqrstuvwxyz C:\\Users\\someone\\repo",
        startedAt: "2026-08-01T12:00:00.000Z",
        finishedAt: "2026-08-01T12:00:01.000Z",
        durationMs: 1_000,
      });

      const steps = listAuditSteps("audit-1");
      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({
        id: stepId,
        job_id: "audit-1",
        step_name: "tests",
        status: "failed",
        exit_code: 1,
        timed_out: 0,
        stopped: 0,
        duration_ms: 1_000,
      });
      expect(steps[0].public_output).toContain("DISCORD_BOT_TOKEN=<redacted>");
      expect(steps[0].public_output).toContain("<local-path>");
      expect(steps[0].public_output).not.toContain("someone");
    });

    it("records isolated repair worktrees for later review and cleanup", () => {
      createAuditJob({
        id: "audit-1",
        channelId: "ch1",
        projectLabel: "/p1",
        mode: "check-only",
        status: "waiting_manual_review",
        currentStep: null,
        iteration: 0,
        maxIterations: 2,
        stopRequested: false,
        capabilities: defaultAuditCapabilities("check-only"),
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
      });

      createAuditRepairWorktree({
        jobId: "audit-1",
        worktreePath: "E:\\codex_works\\Attys_DC_BOT\\.discord-bot-state\\audit-worktrees\\audit-1",
        branchName: "audit-repair/audit-1",
        headCommit: "0123456789abcdef",
        status: "prepared",
        createdAt: "2026-08-01T12:01:00.000Z",
        updatedAt: "2026-08-01T12:01:00.000Z",
      });

      expect(getAuditRepairWorktree("audit-1")).toMatchObject({
        job_id: "audit-1",
        branch_name: "audit-repair/audit-1",
        head_commit: "0123456789abcdef",
        status: "prepared",
        created_at: "2026-08-01T12:01:00.000Z",
        updated_at: "2026-08-01T12:01:00.000Z",
      });

      updateAuditRepairWorktreeStatus("audit-1", "retained", "2026-08-01T12:02:00.000Z");
      expect(getAuditRepairWorktree("audit-1")).toMatchObject({
        status: "retained",
        updated_at: "2026-08-01T12:02:00.000Z",
      });
    });

    it("records public-safe audit repair execution attempts for later tracking", () => {
      createAuditJob({
        id: "audit-1",
        channelId: "ch1",
        projectLabel: "/p1",
        mode: "approved-repair",
        status: "repairing",
        currentStep: "repair",
        iteration: 1,
        maxIterations: 2,
        stopRequested: false,
        capabilities: defaultAuditCapabilities("approved-repair"),
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
      });

      createAuditRepairExecution({
        id: "repair-exec-1",
        jobId: "audit-1",
        status: "starting",
        iteration: 1,
        threadId: null,
        turnId: null,
        resultSummary: "starting repair for C:\\Users\\someone\\repo",
        createdAt: "2026-08-01T12:01:00.000Z",
        updatedAt: "2026-08-01T12:01:00.000Z",
      });

      updateAuditRepairExecutionResult(
        "repair-exec-1",
        "started",
        "repair Codex turn started in C:\\Users\\someone\\repo",
        "2026-08-01T12:01:10.000Z",
        "thread-1",
        "turn-1",
      );

      const execution = getAuditRepairExecution("repair-exec-1");
      expect(execution).toMatchObject({
        id: "repair-exec-1",
        job_id: "audit-1",
        status: "started",
        iteration: 1,
        thread_id: "thread-1",
        turn_id: "turn-1",
        result_summary: "repair Codex turn started in <local-path>",
        created_at: "2026-08-01T12:01:00.000Z",
        updated_at: "2026-08-01T12:01:10.000Z",
      });
      expect(execution!.result_summary).not.toContain("someone");
      expect(listAuditRepairExecutions("audit-1", 1).map((entry) => entry.id)).toEqual(["repair-exec-1"]);

      updateAuditRepairExecutionResult(
        "repair-exec-1",
        "reviewed",
        "operator reviewed repair for C:\\Users\\someone\\repo",
        "2026-08-01T12:01:20.000Z",
      );
      expect(getAuditRepairExecution("repair-exec-1")).toMatchObject({
        status: "reviewed",
        thread_id: "thread-1",
        turn_id: "turn-1",
        result_summary: "operator reviewed repair for <local-path>",
        updated_at: "2026-08-01T12:01:20.000Z",
      });

      unregisterProject("ch1");
      expect(getAuditRepairExecution("repair-exec-1")).toBeUndefined();
    });
  });

  describe("NAS handoff request store", () => {
    beforeEach(() => {
      registerProject("ch1", "/p1", "guild1");
    });

    it("creates and lists public-safe NAS handoff requests", () => {
      createNasHandoffRequest({
        id: "request-1",
        channelId: "ch1",
        auditJobId: "audit-1",
        projectLabel: "E:\\codex_works\\private-project",
        checkName: "plans",
        status: "queued",
        resultSummary: null,
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
      });

      const request = getNasHandoffRequest("request-1");
      expect(request).toMatchObject({
        id: "request-1",
        channel_id: "ch1",
        audit_job_id: "audit-1",
        project_label: "<local-path>/private-project",
        check_name: "plans",
        status: "queued",
        result_summary: null,
      });
      expect(listNasHandoffRequests("ch1", 5).map((entry) => entry.id)).toEqual(["request-1"]);
    });

    it("updates NAS handoff requests from public-safe result summaries", () => {
      createNasHandoffRequest({
        id: "request-1",
        channelId: "ch1",
        projectLabel: "/p1",
        checkName: "plans",
        status: "queued",
        resultSummary: null,
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
      });

      updateNasHandoffRequestResult(
        "request-1",
        "completed",
        "1/1 passed C:\\Users\\someone\\repo",
        "2026-08-01T12:01:00.000Z",
      );

      expect(getNasHandoffRequest("request-1")).toMatchObject({
        status: "completed",
        result_summary: "1/1 passed <local-path>",
        updated_at: "2026-08-01T12:01:00.000Z",
      });
    });

    it("counts NAS handoff requests by status for one channel", () => {
      const base = {
        projectLabel: "proj",
        checkName: "plans",
        resultSummary: null,
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
      };
      createNasHandoffRequest({ ...base, id: "queued-1", channelId: "ch1", status: "queued" });
      createNasHandoffRequest({ ...base, id: "completed-1", channelId: "ch1", status: "completed" });
      createNasHandoffRequest({ ...base, id: "completed-2", channelId: "ch1", status: "completed" });

      registerProject("ch2", "/p2", "guild1");
      createNasHandoffRequest({ ...base, id: "failed-other-channel", channelId: "ch2", status: "failed" });

      expect(countNasHandoffRequestsByStatus("ch1")).toEqual({
        queued: 1,
        completed: 2,
        failed: 0,
      });
    });

    it("lists NAS handoff requests by status for one channel", () => {
      const base = {
        projectLabel: "proj",
        checkName: "plans",
        resultSummary: null,
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
      };
      createNasHandoffRequest({ ...base, id: "queued-1", channelId: "ch1", status: "queued" });
      createNasHandoffRequest({
        ...base,
        id: "failed-1",
        channelId: "ch1",
        status: "failed",
        updatedAt: "2026-08-01T12:01:00.000Z",
      });
      createNasHandoffRequest({
        ...base,
        id: "queued-2",
        channelId: "ch1",
        status: "queued",
        updatedAt: "2026-08-01T12:02:00.000Z",
      });

      registerProject("ch2", "/p2", "guild1");
      createNasHandoffRequest({ ...base, id: "queued-other-channel", channelId: "ch2", status: "queued" });

      expect(listNasHandoffRequestsByStatus("ch1", "queued", 10).map((entry) => entry.id)).toEqual([
        "queued-2",
        "queued-1",
      ]);
      expect(listNasHandoffRequestsByStatus("ch1", "failed", 10).map((entry) => entry.id)).toEqual([
        "failed-1",
      ]);
      expect(listNasHandoffRequestsByStatus("ch1", "all", 10).map((entry) => entry.id)).toEqual([
        "queued-2",
        "failed-1",
        "queued-1",
      ]);
    });

    it("finds NAS handoff requests by public id prefix for one channel", () => {
      const base = {
        projectLabel: "proj",
        checkName: "plans",
        resultSummary: null,
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
        status: "queued" as const,
      };
      createNasHandoffRequest({ ...base, id: "request-alpha-one", channelId: "ch1" });
      createNasHandoffRequest({
        ...base,
        id: "request-alpha-two",
        channelId: "ch1",
        updatedAt: "2026-08-01T12:01:00.000Z",
      });

      registerProject("ch2", "/p2", "guild1");
      createNasHandoffRequest({ ...base, id: "request-alpha-other-channel", channelId: "ch2" });

      expect(findNasHandoffRequestsByIdPrefix("ch1", "req").map((entry) => entry.id)).toEqual([]);
      expect(findNasHandoffRequestsByIdPrefix("ch1", "request-alpha", 10).map((entry) => entry.id)).toEqual([
        "request-alpha-two",
        "request-alpha-one",
      ]);
      expect(findNasHandoffRequestsByIdPrefix("ch2", "request-alpha", 10).map((entry) => entry.id)).toEqual([
        "request-alpha-other-channel",
      ]);
    });

    it("expires stale queued NAS handoff requests for one channel", () => {
      const base = {
        projectLabel: "proj",
        checkName: "plans",
        resultSummary: null,
        updatedAt: "2026-08-01T12:00:00.000Z",
      };
      createNasHandoffRequest({
        ...base,
        id: "old-queued",
        channelId: "ch1",
        status: "queued",
        createdAt: "2026-08-01T12:00:00.000Z",
      });
      createNasHandoffRequest({
        ...base,
        id: "fresh-queued",
        channelId: "ch1",
        status: "queued",
        createdAt: "2026-08-01T12:09:00.000Z",
      });
      registerProject("ch2", "/p2", "guild1");
      createNasHandoffRequest({
        ...base,
        id: "old-other-channel",
        channelId: "ch2",
        status: "queued",
        createdAt: "2026-08-01T12:00:00.000Z",
      });

      const expired = expireStaleNasHandoffRequests(
        "2026-08-01T12:05:00.000Z",
        "2026-08-01T12:15:00.000Z",
        "ch1",
      );

      expect(expired.map((entry) => entry.id)).toEqual(["old-queued"]);
      expect(getNasHandoffRequest("old-queued")).toMatchObject({
        status: "failed",
        result_summary: "no NAS result before stale timeout",
        updated_at: "2026-08-01T12:15:00.000Z",
      });
      expect(getNasHandoffRequest("fresh-queued")).toMatchObject({ status: "queued" });
      expect(getNasHandoffRequest("old-other-channel")).toMatchObject({ status: "queued" });
    });
  });
});
