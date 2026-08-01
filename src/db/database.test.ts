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
  getAuditJob,
  getLatestAuditJob,
  updateAuditJobProgress,
  requestAuditJobStop,
  insertAuditStepResult,
  listAuditSteps,
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
        current_step: null,
        iteration: 0,
        max_iterations: 2,
        stop_requested: 0,
      });
      expect(job!.capabilities_json).toContain("read-context");
      expect(getLatestAuditJob("ch1")!.id).toBe("audit-1");
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
  });
});
