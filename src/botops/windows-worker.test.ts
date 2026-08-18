import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FixedCommandRunner } from "./windows-worker.js";

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
  approveBotOpsJob,
  createOrGetBotOpsJob,
  getBotOpsJob,
  initDatabase,
  listBotOpsWorkerHeartbeats,
} from "../db/database.js";
import {
  buildWindowsWorkerStatusSnapshot,
  formatWindowsWorkerStatus,
  recordWindowsWorkerStatus,
  readBotLockState,
  readWorkerConfigState,
  resolveWindowsWorkerRepoRoot,
  runWindowsWorkerOnce,
} from "./windows-worker.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attys-windows-worker-test-"));
  tempDirs.push(dir);
  return dir;
}

function makeRunner(gitStatusOutput: string, npmCode = 0, cmdCode = 0): FixedCommandRunner {
  return (command, args) => {
    if (command === "git" && args.join(" ") === "status --porcelain") {
      return { code: 0, output: gitStatusOutput };
    }
    if (command === "git" && args.join(" ") === "rev-parse --abbrev-ref --symbolic-full-name @{u}") {
      return { code: 0, output: "origin/main" };
    }
    if (command === "git" && args.join(" ") === "rev-list --left-right --count HEAD...@{u}") {
      return { code: 0, output: "0\t0" };
    }
    if (command === "git" && args.join(" ") === "push") {
      return { code: 0, output: "pushed" };
    }
    if (command === "npm" || command === "npm.cmd") {
      return { code: npmCode, output: npmCode === 0 ? "ok" : "failed" };
    }
    if (command === "cmd" && args.join(" ") === "/c win-start.bat") {
      return { code: cmdCode, output: cmdCode === 0 ? "restarted" : "failed" };
    }
    return { code: 1, output: "unexpected command" };
  };
}

describe("Windows worker", () => {
  beforeEach(() => {
    initDatabase();
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  it("reports idle when there is no Windows job", () => {
    const repo = makeTempDir();
    const result = runWindowsWorkerOnce(repo, "worker-1", makeRunner(""));

    expect(result.status).toBe("idle");
    expect(result.result).toBe("no requested Windows worker job");
    expect(listBotOpsWorkerHeartbeats("windows")[0]).toMatchObject({
      worker_id: "worker-1",
      status: "idle",
      detail: "no requested Windows worker job",
    });
  });

  it("completes a Windows status job without requiring a clean worktree", () => {
    const repo = makeTempDir();
    createOrGetBotOpsJob({
      job_id: "windows-status-1",
      requested_by: "operator",
      target: "windows",
      capability: "status.read",
      summary: "windows status",
    });

    const result = runWindowsWorkerOnce(
      repo,
      "worker-1",
      makeRunner(" M src/file.ts"),
      new Date("2026-08-18T10:01:00.000Z"),
    );

    expect(result.status).toBe("completed");
    expect(result.result).toContain("Windows worker status completed");
    expect(result.result).toContain("worktree: dirty");
    expect(getBotOpsJob("windows-status-1")?.status).toBe("Completed");
  });

  it("blocks check jobs on a dirty worktree", () => {
    const repo = makeTempDir();
    createOrGetBotOpsJob({
      job_id: "windows-check-1",
      requested_by: "operator",
      target: "windows",
      capability: "audit.check",
      summary: "check",
    });

    const result = runWindowsWorkerOnce(
      repo,
      "worker-1",
      makeRunner(" M src/file.ts"),
      new Date("2026-08-18T10:01:00.000Z"),
    );

    expect(result.status).toBe("failed");
    expect(result.result).toBe("check helper blocked: worktree dirty");
    expect(getBotOpsJob("windows-check-1")?.status).toBe("Failed");
  });

  it("runs only the fixed npm check helper for clean check jobs", () => {
    const repo = makeTempDir();
    fs.writeFileSync(path.join(repo, ".env"), "BASE_PROJECT_DIR=C:\\workspace\n");
    const calls: string[] = [];
    const runner: FixedCommandRunner = (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (command === "git") return { code: 0, output: "" };
      if (command === "npm" || command === "npm.cmd") return { code: 0, output: "ok" };
      return { code: 1, output: "unexpected" };
    };
    createOrGetBotOpsJob({
      job_id: "windows-check-2",
      requested_by: "operator",
      target: "windows",
      capability: "audit.check",
      summary: "check",
    });

    const result = runWindowsWorkerOnce(repo, "worker-1", runner);

    expect(result.status).toBe("completed");
    expect(result.result).toBe("check helper completed: npm run check passed");
    expect(calls).toContain("git status --porcelain");
    expect(calls.some((call) => call.endsWith("run check"))).toBe(true);
  });

  it("does not pick service restart jobs without approval", () => {
    const repo = makeTempDir();
    createOrGetBotOpsJob({
      job_id: "restart-1",
      requested_by: "operator",
      target: "windows",
      capability: "service.restart",
      summary: "restart",
    });

    expect(runWindowsWorkerOnce(repo, "worker-1", makeRunner("")).status).toBe("idle");
    expect(getBotOpsJob("restart-1")?.status).toBe("WaitingApproval");
  });

  it("does not pick git push jobs without approval", () => {
    const repo = makeTempDir();
    createOrGetBotOpsJob({
      job_id: "push-1",
      requested_by: "operator",
      target: "windows",
      capability: "git.push",
      summary: "push",
    });

    expect(runWindowsWorkerOnce(repo, "worker-1", makeRunner("")).status).toBe("idle");
    expect(getBotOpsJob("push-1")?.status).toBe("WaitingApproval");
  });

  it("blocks approved git push jobs on a dirty worktree", () => {
    const repo = makeTempDir();
    createOrGetBotOpsJob({
      job_id: "push-dirty",
      requested_by: "operator",
      target: "windows",
      capability: "git.push",
      summary: "push",
    });
    approveBotOpsJob("push-dirty", "operator", new Date("2026-08-18T10:00:00.000Z"));

    const result = runWindowsWorkerOnce(
      repo,
      "worker-1",
      makeRunner(" M src/file.ts"),
      new Date("2026-08-18T10:01:00.000Z"),
    );

    expect(result.status).toBe("failed");
    expect(result.result).toBe("git push blocked: worktree dirty");
    expect(getBotOpsJob("push-dirty")?.status).toBe("Failed");
  });

  it("blocks approved git push jobs when the upstream is behind", () => {
    const repo = makeTempDir();
    const runner: FixedCommandRunner = (command, args) => {
      if (command === "git" && args.join(" ") === "status --porcelain") return { code: 0, output: "" };
      if (command === "git" && args.join(" ") === "rev-parse --abbrev-ref --symbolic-full-name @{u}") {
        return { code: 0, output: "origin/main" };
      }
      if (command === "git" && args.join(" ") === "rev-list --left-right --count HEAD...@{u}") {
        return { code: 0, output: "0\t1" };
      }
      return { code: 1, output: "unexpected" };
    };
    createOrGetBotOpsJob({
      job_id: "push-behind",
      requested_by: "operator",
      target: "windows",
      capability: "git.push",
      summary: "push",
    });
    approveBotOpsJob("push-behind", "operator", new Date("2026-08-18T10:00:00.000Z"));

    const result = runWindowsWorkerOnce(repo, "worker-1", runner, new Date("2026-08-18T10:01:00.000Z"));

    expect(result.status).toBe("failed");
    expect(result.result).toBe("git push blocked: upstream behind=1");
    expect(getBotOpsJob("push-behind")?.status).toBe("Failed");
  });

  it("runs only fixed git push commands after exact approval", () => {
    const repo = makeTempDir();
    const calls: string[] = [];
    const runner: FixedCommandRunner = (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (command === "git" && args.join(" ") === "status --porcelain") return { code: 0, output: "" };
      if (command === "git" && args.join(" ") === "rev-parse --abbrev-ref --symbolic-full-name @{u}") {
        return { code: 0, output: "origin/main" };
      }
      if (command === "git" && args.join(" ") === "rev-list --left-right --count HEAD...@{u}") {
        return { code: 0, output: "2\t0" };
      }
      if (command === "git" && args.join(" ") === "push") return { code: 0, output: "pushed" };
      return { code: 1, output: "unexpected" };
    };
    createOrGetBotOpsJob({
      job_id: "push-approved",
      requested_by: "operator",
      target: "windows",
      capability: "git.push",
      summary: "push",
    });
    approveBotOpsJob("push-approved", "operator", new Date("2026-08-18T10:00:00.000Z"));

    const result = runWindowsWorkerOnce(repo, "worker-1", runner, new Date("2026-08-18T10:01:00.000Z"));

    expect(result.status).toBe("completed");
    expect(result.result).toBe("git push helper completed: pushed 2 commit(s)");
    expect(calls).toEqual([
      "git status --porcelain",
      "git rev-parse --abbrev-ref --symbolic-full-name @{u}",
      "git rev-list --left-right --count HEAD...@{u}",
      "git push",
      "git status --porcelain",
    ]);
    expect(getBotOpsJob("push-approved")?.status).toBe("Completed");
  });

  it("blocks approved service restart jobs on a dirty worktree", () => {
    const repo = makeTempDir();
    fs.writeFileSync(path.join(repo, ".env"), "BASE_PROJECT_DIR=C:\\workspace\n");
    fs.writeFileSync(path.join(repo, "win-start.bat"), "@echo off\n");
    createOrGetBotOpsJob({
      job_id: "restart-dirty",
      requested_by: "operator",
      target: "windows",
      capability: "service.restart",
      summary: "restart",
    });
    approveBotOpsJob("restart-dirty", "operator", new Date("2026-08-18T10:00:00.000Z"));

    const result = runWindowsWorkerOnce(
      repo,
      "worker-1",
      makeRunner(" M src/file.ts"),
      new Date("2026-08-18T10:01:00.000Z"),
    );

    expect(result.status).toBe("failed");
    expect(result.result).toBe("service restart blocked: worktree dirty");
    expect(getBotOpsJob("restart-dirty")?.status).toBe("Failed");
  });

  it("runs only the fixed win-start restart helper after exact approval", () => {
    const repo = makeTempDir();
    fs.writeFileSync(path.join(repo, ".env"), "BASE_PROJECT_DIR=C:\\workspace\n");
    fs.writeFileSync(path.join(repo, "win-start.bat"), "@echo off\n");
    const calls: string[] = [];
    const runner: FixedCommandRunner = (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      if (command === "git") return { code: 0, output: "" };
      if (command === "cmd" && args.join(" ") === "/c win-start.bat") {
        return { code: 0, output: "restarted" };
      }
      return { code: 1, output: "unexpected" };
    };
    createOrGetBotOpsJob({
      job_id: "restart-approved",
      requested_by: "operator",
      target: "windows",
      capability: "service.restart",
      summary: "restart",
    });
    approveBotOpsJob("restart-approved", "operator", new Date("2026-08-18T10:00:00.000Z"));

    const result = runWindowsWorkerOnce(repo, "worker-1", runner, new Date("2026-08-18T10:01:00.000Z"));

    expect(result.status).toBe("completed");
    expect(result.result).toBe("service restart helper completed: win-start.bat returned success");
    expect(calls).toContain("git status --porcelain");
    expect(calls).toContain("cmd /c win-start.bat");
    expect(calls.some((call) => call.includes("powershell"))).toBe(false);
    expect(getBotOpsJob("restart-approved")?.status).toBe("Completed");
  });

  it("requires real worker config instead of treating the database path as bot config", () => {
    const repo = makeTempDir();
    const originalDatabasePath = process.env.DISCORD_DATABASE_PATH;
    process.env.DISCORD_DATABASE_PATH = path.join(repo, ".discord-bot-state", "bridge.sqlite");

    try {
      expect(readWorkerConfigState(repo)).toBe("missing");
    } finally {
      if (originalDatabasePath === undefined) {
        delete process.env.DISCORD_DATABASE_PATH;
      } else {
        process.env.DISCORD_DATABASE_PATH = originalDatabasePath;
      }
    }
  });

  it("resolves an explicit absolute Windows worker target repo", () => {
    const repo = makeTempDir();

    expect(resolveWindowsWorkerRepoRoot(process.cwd(), repo)).toBe(path.resolve(repo));
  });

  it("fails closed for relative or missing Windows worker target repos", () => {
    const repo = makeTempDir();

    expect(() => resolveWindowsWorkerRepoRoot(repo, "relative-target")).toThrow(
      "BOTOPS_WINDOWS_TARGET_REPO_ROOT must be an absolute path",
    );
    expect(() => resolveWindowsWorkerRepoRoot(repo, path.join(repo, "missing"))).toThrow(
      "BOTOPS_WINDOWS_TARGET_REPO_ROOT must point to an existing directory",
    );
  });

  it("reports stale bot locks without stopping any process", () => {
    const repo = makeTempDir();
    fs.writeFileSync(path.join(repo, ".bot.lock"), "999999999");

    expect(readBotLockState(repo)).toBe("stale");
  });

  it("formats public-safe worker status", () => {
    const repo = makeTempDir();
    const formatted = formatWindowsWorkerStatus(
      buildWindowsWorkerStatusSnapshot(repo, "worker-1", makeRunner("")),
    );

    expect(formatted).toContain("worker: worker-1");
    expect(formatted).toContain("capabilities: status.read, audit.check, git.push, service.restart");
    expect(formatted).toContain("worktree: clean");
    expect(formatted).not.toContain(":\\");
  });

  it("records public-safe status heartbeats", () => {
    const repo = makeTempDir();
    const snapshot = buildWindowsWorkerStatusSnapshot(repo, "worker-1", makeRunner(" M src/file.ts"));
    recordWindowsWorkerStatus(snapshot, "status", "manual status check", new Date("2026-08-18T10:00:00.000Z"));

    expect(listBotOpsWorkerHeartbeats("windows")[0]).toMatchObject({
      worker_id: "worker-1",
      target: "windows",
      capabilities: "status.read, audit.check, git.push, service.restart",
      status: "status",
      detail: "manual status check",
      heartbeat_at: "2026-08-18T10:00:00.000Z",
    });
  });
});
